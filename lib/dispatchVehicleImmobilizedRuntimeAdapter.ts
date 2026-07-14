import type { ActiveTripCampCandidateSummary } from './activeTripMode';
import type { ConvoyTrackingStoreState } from '../stores/convoyTrackingStore';
import type { ECSVehicularState } from './fleet/activeVehicleState';
import { buildReadinessVehicleInputFromFleetState } from './readiness/fleetReadinessAdapter';
import { buildConvoyLocationSourceTruthBinding } from './sourceTruthAdapters';
import { sanitizeMissionCommandLinkedContext } from './dispatchMissionCommandDomain';
import type { MissionCommandActor } from './dispatchMissionCommandTypes';
import type { DispatchLinkedContext } from './dispatchTypes';
import type { TerrainIntelligence } from './terrainAnalysisEngine';
import {
  formatWeatherAlertLine,
  formatWeatherHeadline,
  type ECSWeatherSnapshot,
} from './ecsWeather';
import {
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthOrigin,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from './sourceTruth';
import type {
  VehicleImmobilizedCreateInput,
  VehicleImmobilizedEvidenceInput,
  VehicleImmobilizedMemberRef,
} from './dispatchVehicleImmobilizedPlaybook';

export interface BuildVehicleImmobilizedRuntimeInput {
  expeditionId: string;
  actor: MissionCommandActor;
  soloMode: boolean;
  online: boolean;
  affectedVehicleState: ECSVehicularState;
  vehicleStates: readonly ECSVehicularState[];
  members: readonly VehicleImmobilizedMemberRef[];
  initialStatus: VehicleImmobilizedCreateInput['initialStatus'];
  currentMemberId?: string | null;
  currentLocationContext?: DispatchLinkedContext | null;
  memberLocationPermissionAllowed: boolean;
  positionSharingEnabled: boolean;
  convoy: ConvoyTrackingStoreState;
  routeContext?: DispatchLinkedContext | null;
  routeSegmentContext?: DispatchLinkedContext | null;
  bailoutOrCampContext?: DispatchLinkedContext | null;
  terrain?: TerrainIntelligence | null;
  weather?: ECSWeatherSnapshot | null;
  campCandidate?: ActiveTripCampCandidateSummary | null;
  approvedRecoveryProtocols?: Array<{ id: string; title: string }>;
  statusReviewMinutes?: number;
  now?: string | number | Date;
  idempotencyKey?: string;
}

/**
 * Builds a privacy-minimized point-in-time snapshot for Vehicle Immobilized.
 * This adapter reads no stores, never infers occupants, and never treats a
 * Fleet profile or cached route analysis as proof that a recovery is safe.
 */
export function buildVehicleImmobilizedRuntimeInput(
  input: BuildVehicleImmobilizedRuntimeInput,
): VehicleImmobilizedCreateInput {
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const vehicleId = input.affectedVehicleState.identity.vehicleId
    ?? input.affectedVehicleState.vehicle?.id
    ?? input.affectedVehicleState.identity.activeVehicleId
    ?? 'vehicle-unavailable';
  const vehicleLabel = safeText(input.affectedVehicleState.identity.displayName, 160)
    || 'Affected vehicle';
  const vehicleSource = fleetSource(input.affectedVehicleState, now);
  const affectedVehicleContext = sanitizeMissionCommandLinkedContext({
    id: vehicleId,
    type: 'vehicle',
    title: vehicleLabel,
    subtitle: fleetStatusLabel(input.affectedVehicleState),
    observedAt: normalizeIso(input.affectedVehicleState.updatedAt),
    stale: false,
    restricted: false,
    sourceTruthPolicyKey: 'vehicle_profile',
    sourceTruth: vehicleSource,
    metadata: { vehicleId, source: 'vehicleStore' },
  })!;
  const readiness = buildReadinessVehicleInputFromFleetState(input.affectedVehicleState);
  const routeContext = sanitizeMissionCommandLinkedContext(input.routeContext ?? undefined) ?? null;
  const routeSegmentContext = sanitizeMissionCommandLinkedContext(input.routeSegmentContext ?? undefined) ?? null;
  const locationContext = buildAffectedVehicleLocation({
    vehicleId,
    vehicleLabel,
    ownerMemberId: input.affectedVehicleState.vehicle?.owner_user_id ?? null,
    currentMemberId: input.currentMemberId ?? null,
    soloMode: input.soloMode,
    currentLocationContext: input.currentLocationContext ?? null,
    memberLocationPermissionAllowed: input.memberLocationPermissionAllowed,
    positionSharingEnabled: input.positionSharingEnabled,
    convoy: input.convoy,
    now,
  });
  const bailoutOrCampContext = sanitizeMissionCommandLinkedContext(input.bailoutOrCampContext ?? undefined)
    ?? campContext(input.campCandidate, now);
  const candidates = normalizeMembers(input.members);
  const affectedOwnerId = input.affectedVehicleState.vehicle?.owner_user_id ?? null;
  const recoveryLeadCandidates = input.soloMode
    ? []
    : candidates.filter((member) => member.id !== affectedOwnerId && (
      member.roleId === 'owner' || member.roleId === 'admin' || member.roleId === 'lead'
    ));
  const spotterCandidates = input.soloMode
    ? []
    : candidates.filter((member) => member.id !== affectedOwnerId && member.id !== input.actor.id);
  const knownMemberIds = new Set(candidates.map((member) => member.id).concat(input.actor.id));

  return {
    expeditionId: input.expeditionId,
    actor: input.actor,
    soloMode: input.soloMode,
    online: input.online,
    affectedVehicle: {
      id: vehicleId,
      label: vehicleLabel,
      ownerMemberId: affectedOwnerId,
      sourceTruth: [vehicleSource],
      context: affectedVehicleContext,
    },
    // The vehicle owner is not automatically an occupant. Occupants remain unknown
    // until an operator supplies an explicit roster association in a future input.
    occupants: [],
    initialStatus: input.initialStatus,
    locationContext,
    routeContext,
    routeSegmentContext,
    terrain: terrainEvidence(input.terrain, routeContext, now),
    attitude: unavailableEvidence('Live vehicle attitude unavailable', 'vehicle-attitude-unavailable', now),
    weather: weatherEvidence(input.weather, now),
    daylight: daylightEvidence(input.weather, now),
    convoy: convoyEvidence(input.convoy, now),
    recoveryEquipment: recoveryEquipmentEvidence(readiness, vehicleSource, now),
    vehicleReadiness: vehicleReadinessEvidence(input.affectedVehicleState, vehicleSource),
    communicationState: communicationEvidence(input.online, now),
    recoveryCapableVehicles: input.vehicleStates
      .filter((state) => state.identity.vehicleId !== vehicleId)
      .flatMap((state) => {
        const candidateReadiness = buildReadinessVehicleInputFromFleetState(state);
        if (!candidateReadiness || candidateReadiness.recoveryGearReady !== true || !state.identity.vehicleId) return [];
        return [{
          id: state.identity.vehicleId,
          label: state.identity.displayName,
          memberIds: state.vehicle?.owner_user_id ? [state.vehicle.owner_user_id] : [],
          sourceTruth: [fleetSource(state, now)],
        }];
      }),
    recoveryLeadCandidates,
    spotterCandidates,
    leadMemberId: findConvoyRoleTarget(input.convoy, 'lead', knownMemberIds),
    sweepMemberId: findConvoyRoleTarget(input.convoy, 'sweep', knownMemberIds),
    bailoutOrCampContext,
    approvedRecoveryProtocols: input.approvedRecoveryProtocols ?? [],
    statusReviewMinutes: input.statusReviewMinutes,
    now,
    idempotencyKey: input.idempotencyKey,
  };
}

function buildAffectedVehicleLocation(input: {
  vehicleId: string;
  vehicleLabel: string;
  ownerMemberId: string | null;
  currentMemberId: string | null;
  soloMode: boolean;
  currentLocationContext: DispatchLinkedContext | null;
  memberLocationPermissionAllowed: boolean;
  positionSharingEnabled: boolean;
  convoy: ConvoyTrackingStoreState;
  now: string;
}): DispatchLinkedContext | null {
  const ownedByCurrentUser = Boolean(
    input.ownerMemberId && input.currentMemberId && input.ownerMemberId === input.currentMemberId,
  );
  if ((ownedByCurrentUser || input.soloMode) && input.currentLocationContext) {
    return sanitizeMissionCommandLinkedContext({
      ...input.currentLocationContext,
      id: `vehicle-location:${input.vehicleId}:${input.currentLocationContext.id}`,
      title: `${input.vehicleLabel} last verified location`,
    }) ?? null;
  }

  const member = input.convoy.rawMembers.find((candidate) => (
    candidate.revoked_at == null && (
      candidate.vehicle_id === input.vehicleId ||
      (!!input.ownerMemberId && candidate.user_id === input.ownerMemberId)
    )
  ));
  if (!member) return null;
  if (!input.memberLocationPermissionAllowed || !input.positionSharingEnabled) {
    const permissionDenied = !input.memberLocationPermissionAllowed;
    return sanitizeMissionCommandLinkedContext({
      id: `vehicle-location-restricted:${input.vehicleId}`,
      type: 'member',
      title: `${input.vehicleLabel} location restricted`,
      subtitle: permissionDenied
        ? 'Member-location permission does not allow this position.'
        : 'The associated member has not enabled GPS sharing.',
      restricted: true,
      stale: false,
      sourceTruthPolicyKey: 'convoy_member_location',
      sourceTruth: sourceRef({
        id: `vehicle-location-restricted:${input.vehicleId}`,
        origin: 'unavailable',
        policyKey: 'convoy_member_location',
        authority: permissionDenied ? 'Member-location permission' : 'Member GPS-sharing state',
        observedAt: null,
        available: false,
      }),
    }) ?? null;
  }

  const location = input.convoy.rawLocations.find((candidate) => candidate.member_id === member.id);
  if (!location || !validCoordinate(location.latitude, location.longitude) || !normalizeIso(location.captured_at)) {
    return null;
  }
  const normalized = input.convoy.members.find((candidate) => candidate.memberId === member.id);
  const binding = buildConvoyLocationSourceTruthBinding({
    memberId: member.id,
    observedAt: location.captured_at,
    accuracyMeters: location.accuracy_meters,
    sourceLabel: 'ECS convoy member GPS sharing',
    stale: normalized?.isStale ?? false,
    offline: input.convoy.connectionStatus !== 'connected',
  });
  return sanitizeMissionCommandLinkedContext({
    id: `vehicle-location:${input.vehicleId}:${location.captured_at}`,
    type: 'pin',
    title: `${input.vehicleLabel} last verified location`,
    subtitle: `${normalized?.isStale ? 'Stale' : 'Shared'} convoy position; movement is not inferred.`,
    coordinates: { latitude: location.latitude, longitude: location.longitude },
    observedAt: location.captured_at,
    stale: normalized?.isStale ?? false,
    restricted: false,
    sourceTruthPolicyKey: 'convoy_member_location',
    sourceTruth: binding.ref,
  }) ?? null;
}

function recoveryEquipmentEvidence(
  readiness: ReturnType<typeof buildReadinessVehicleInputFromFleetState>,
  source: SourceTruthRef,
  now: string,
): VehicleImmobilizedEvidenceInput {
  if (!readiness || readiness.recoveryGearReady == null) {
    return {
      label: readiness?.recoveryGearSummary ?? 'Recovery gear readiness unknown; required equipment is not visible in Fleet.',
      state: 'missing',
      observedAt: source.observedAt ?? now,
      sourceTruth: [source],
    };
  }
  return {
    label: readiness.recoveryGearReady
      ? readiness.recoveryGearSummary ?? 'Recovery equipment is visible in Fleet; condition and suitability are not verified.'
      : readiness.recoveryGearSummary ?? 'Fleet does not verify recovery equipment readiness.',
    state: 'available',
    observedAt: source.observedAt ?? now,
    sourceTruth: [source],
  };
}

function vehicleReadinessEvidence(
  state: ECSVehicularState,
  source: SourceTruthRef,
): VehicleImmobilizedEvidenceInput {
  if (!state.identity.hasVehicle) {
    return { label: 'Vehicle profile unavailable', state: 'missing', observedAt: state.updatedAt, sourceTruth: [source] };
  }
  return {
    label: state.status === 'ready'
      ? `Fleet profile available / ${state.confidence.label} confidence`
      : `Fleet profile partial / ${state.confidence.label} confidence`,
    state: 'available',
    observedAt: state.updatedAt,
    sourceTruth: [source],
  };
}

function terrainEvidence(
  terrain: TerrainIntelligence | null | undefined,
  route: DispatchLinkedContext | null,
  now: string,
): VehicleImmobilizedEvidenceInput {
  if (!terrain) return unavailableEvidence('Route-bound terrain analysis unavailable', 'terrain-unavailable', now);
  const routeMatches = Boolean(route?.title && terrain.routeName && (
    route.title.trim().toLowerCase() === terrain.routeName.trim().toLowerCase()
  ));
  if (!routeMatches) {
    return unavailableEvidence('Cached terrain analysis is not verified for the active route context', 'terrain-route-mismatch', now);
  }
  return {
    label: `Cached route terrain planning risk: ${terrain.overallRisk.toLowerCase()} / ${terrain.totalSegments} analyzed segments`,
    state: 'stale',
    observedAt: terrain.analyzedAt,
    sourceTruth: [sourceRef({
      id: `terrain-analysis:${terrain.id}`,
      origin: 'cached',
      policyKey: 'manual_user_state',
      authority: 'ECS terrain planning analysis',
      observedAt: terrain.analyzedAt,
      warningCodes: ['planning_reference_only', 'terrain_safety_not_verified'],
    })],
  };
}

function weatherEvidence(
  weather: ECSWeatherSnapshot | null | undefined,
  now: string,
): VehicleImmobilizedEvidenceInput {
  if (
    !weather ||
    !weather.status ||
    typeof weather.status.kind !== 'string' ||
    !weather.provider ||
    !weather.current ||
    ['unavailable', 'provider_error', 'permission_required', 'permission-blocked', 'network-blocked', 'waiting_for_gps', 'error'].includes(weather.status.kind)
  ) {
    return unavailableEvidence('Operational weather unavailable', 'weather-unavailable', now, 'weather_observation');
  }
  const stale = weather.status.stale || ['cached', 'stale', 'offline'].includes(weather.status.kind);
  const alert = formatWeatherAlertLine(weather);
  return {
    label: [formatWeatherHeadline(weather), alert].filter(Boolean).join(' / '),
    state: stale ? 'stale' : 'available',
    observedAt: weather.fetchedAt,
    sourceTruth: [sourceRef({
      id: `operational-weather:${weather.provider.id || 'provider'}:${weather.fetchedAt ?? now}`,
      origin: stale ? 'cached' : 'live',
      policyKey: 'weather_observation',
      authority: weather.provider.name || 'Operational weather broker',
      observedAt: weather.fetchedAt,
      available: true,
      warningCodes: stale ? ['cached_weather', 'weather_stale'] : [],
    })],
  };
}

function daylightEvidence(
  weather: ECSWeatherSnapshot | null | undefined,
  now: string,
): VehicleImmobilizedEvidenceInput {
  const sunsetSeconds = weather?.current?.sunset;
  if (!Number.isFinite(sunsetSeconds)) {
    return unavailableEvidence('Daylight estimate unavailable', 'daylight-unavailable', now);
  }
  const sunsetMs = Number(sunsetSeconds) * 1_000;
  const nowMs = Date.parse(now);
  const deltaMinutes = Math.round((sunsetMs - nowMs) / 60_000);
  const label = deltaMinutes >= 0
    ? `${deltaMinutes} minutes of estimated daylight remain`
    : `Estimated sunset passed ${Math.abs(deltaMinutes)} minutes ago`;
  return {
    label,
    state: weather?.status.stale ? 'stale' : 'available',
    observedAt: weather?.fetchedAt,
    sourceTruth: [sourceRef({
      id: `daylight-estimate:${weather?.fetchedAt ?? now}`,
      origin: 'estimated',
      policyKey: 'weather_observation',
      authority: weather?.provider.name || 'Operational weather broker',
      observedAt: weather?.fetchedAt ?? now,
      warningCodes: ['estimated_daylight'],
    })],
  };
}

function convoyEvidence(
  convoy: ConvoyTrackingStoreState,
  now: string,
): VehicleImmobilizedEvidenceInput {
  if (!convoy.convoyId) return unavailableEvidence('No active convoy', 'convoy-unavailable', now, 'convoy_member_location');
  const stale = convoy.connectionStatus !== 'connected' || convoy.staleCount > 0;
  return {
    label: `Active convoy / ${convoy.members.length} tracked / ${convoy.staleCount} stale`,
    state: stale ? 'stale' : 'available',
    observedAt: convoy.lastUpdated,
    sourceTruth: [sourceRef({
      id: `convoy-state:${convoy.convoyId}`,
      origin: convoy.connectionStatus === 'connected' ? 'live' : 'cached',
      policyKey: 'convoy_member_location',
      authority: 'ECS convoy tracking',
      observedAt: convoy.lastUpdated,
      available: true,
      warningCodes: stale ? ['convoy_state_stale_or_partial'] : [],
    })],
  };
}

function communicationEvidence(online: boolean, now: string): VehicleImmobilizedEvidenceInput {
  return {
    label: online
      ? 'ECS Dispatch network available'
      : 'ECS Dispatch offline; new commands remain local or queued until connectivity returns',
    state: 'available',
    observedAt: now,
    sourceTruth: [sourceRef({
      id: `dispatch-connectivity:${online ? 'online' : 'offline'}:${now}`,
      origin: 'inferred',
      policyKey: 'manual_user_state',
      authority: 'ECS connectivity state',
      observedAt: now,
      warningCodes: online ? [] : ['offline_operation'],
    })],
  };
}

function campContext(
  candidate: ActiveTripCampCandidateSummary | null | undefined,
  now: string,
): DispatchLinkedContext | null {
  if (!candidate?.id && !candidate?.name) return null;
  const legalUnknown = !candidate.legalStatus || String(candidate.legalConfidence ?? 'unknown') === 'unknown';
  const coordinate = normalizeCoordinate(candidate.coordinate);
  return sanitizeMissionCommandLinkedContext({
    id: candidate.id ?? `active-trip-camp:${candidate.name}`,
    type: 'camp',
    title: candidate.name ?? 'Active trip camp candidate',
    subtitle: `Planning candidate / legal ${candidate.legalStatus ?? 'unknown'} / access confidence ${candidate.accessConfidence ?? 'unknown'}`,
    coordinates: coordinate ?? undefined,
    observedAt: now,
    stale: false,
    restricted: false,
    sourceTruthPolicyKey: 'route_legal_access_evidence',
    sourceTruth: sourceRef({
      id: `active-trip-camp:${candidate.id ?? candidate.name}`,
      origin: candidate.source === 'manual' ? 'manual' : 'cached',
      policyKey: 'route_legal_access_evidence',
      authority: candidate.source ?? 'ECS Active Trip plan',
      observedAt: now,
      available: true,
      warningCodes: legalUnknown ? ['legal_access_unknown', 'camp_candidate_not_selected'] : ['camp_candidate_not_selected'],
    }),
  }) ?? null;
}

function findConvoyRoleTarget(
  convoy: ConvoyTrackingStoreState,
  role: 'lead' | 'sweep',
  knownMemberIds: ReadonlySet<string>,
): string | null {
  const member = convoy.rawMembers.find((candidate) => (
    candidate.role === role &&
    candidate.revoked_at == null &&
    !!candidate.user_id &&
    knownMemberIds.has(candidate.user_id)
  ));
  return member?.user_id ?? null;
}

function normalizeMembers(values: readonly VehicleImmobilizedMemberRef[]): VehicleImmobilizedMemberRef[] {
  const byId = new Map<string, VehicleImmobilizedMemberRef>();
  values.forEach((value) => {
    const id = safeId(value.id);
    if (!id) return;
    byId.set(id, {
      id,
      label: safeText(value.label, 120) || id,
      roleId: safeId(value.roleId) ?? undefined,
    });
  });
  return [...byId.values()];
}

function fleetStatusLabel(state: ECSVehicularState): string {
  return state.status === 'ready'
    ? `Fleet profile / ${state.confidence.label} confidence`
    : `Partial Fleet profile / ${state.confidence.label} confidence`;
}

function fleetSource(state: ECSVehicularState, now: string): SourceTruthRef {
  return sourceRef({
    id: `fleet-vehicle:${state.identity.vehicleId ?? state.identity.activeVehicleId ?? 'missing'}`,
    origin: 'manual',
    policyKey: 'vehicle_profile',
    authority: 'ECS Fleet profile',
    observedAt: state.updatedAt ?? state.identity.updatedAt ?? now,
    available: state.identity.hasVehicle,
    warningCodes: state.status === 'ready' ? ['manual_vehicle_profile'] : ['manual_vehicle_profile', 'vehicle_profile_partial'],
  });
}

function unavailableEvidence(
  label: string,
  id: string,
  now: string,
  policyKey: SourceTruthPolicyKey = 'manual_user_state',
): VehicleImmobilizedEvidenceInput {
  return {
    label,
    state: 'unavailable',
    observedAt: null,
    sourceTruth: [sourceRef({ id, origin: 'unavailable', policyKey, authority: label, observedAt: null, available: false })],
  };
}

function sourceRef(input: {
  id: string;
  origin: SourceTruthOrigin;
  policyKey: SourceTruthPolicyKey;
  authority: string;
  observedAt: string | null | undefined;
  available?: boolean;
  warningCodes?: string[];
}): SourceTruthRef {
  const available = input.available ?? input.origin !== 'unavailable';
  return sanitizeSourceTruthRef({
    id: input.id,
    origin: input.origin,
    role: 'primary',
    policyKey: input.policyKey,
    authority: safeText(input.authority, 120),
    authorityKind: input.origin === 'manual'
      ? 'user'
      : input.origin === 'unavailable'
        ? 'unknown'
        : 'ecs',
    observedAt: normalizeIso(input.observedAt) ?? null,
    confidence: available ? input.origin === 'estimated' || input.origin === 'inferred' ? 'medium' : 'high' : 'unknown',
    coverage: available ? 'partial' : 'unknown',
    availability: available ? 'usable' : 'unavailable',
    conflictState: 'none',
    warningCodes: input.warningCodes ?? [],
  });
}

function safeText(value: unknown, max: number): string {
  return sanitizeSourceTruthDisplayText(value, max) ?? '';
}

function safeId(value: unknown): string | null {
  const normalized = String(value ?? '').trim().slice(0, 180);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function normalizeIso(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).toISOString() : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function validCoordinate(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function normalizeCoordinate(value: unknown): { latitude: number; longitude: number } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const latitude = record.latitude ?? record.lat;
  const longitude = record.longitude ?? record.lng;
  return validCoordinate(latitude, longitude)
    ? { latitude: latitude as number, longitude: longitude as number }
    : null;
}

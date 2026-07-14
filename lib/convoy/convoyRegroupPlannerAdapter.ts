import type { ECSPin } from '../../components/navigate/PinTypes';
import { bailoutStore, type BailoutPoint } from '../bailoutStore';
import type { DispatchLinkedContext, DispatchLinkedContextType } from '../dispatchTypes';
import { buildEnvironmentSnapshot } from '../environmentSnapshotService';
import type { NavigateRouteSessionSnapshot } from '../navigateRouteSessionStore';
import { pinStore } from '../pinStore';
import { routeContextOrchestrator } from '../routeContext/routeContextOrchestrator';
import type {
  BailoutCandidate,
  CampCandidate,
  Confidence,
  RouteContext,
  RouteContextWarning,
  SupplyCandidate,
} from '../routeContext/routeContextTypes';
import { routeStore, type ImportedRoute, type RouteWaypoint } from '../routeStore';
import {
  evaluateSourceTruthRef,
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthConfidence,
  type SourceTruthOrigin,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from '../sourceTruth';
import type { ConvoyMapVehicle, ConvoyRealtimeConnectionStatus } from './convoyRealtimeService';
import {
  planConvoyRegroup,
  type ConvoyRegroupCandidateAccess,
  type ConvoyRegroupCandidateInput,
  type ConvoyRegroupCandidateType,
  type ConvoyRegroupDaylightInput,
  type ConvoyRegroupHazardInput,
  type ConvoyRegroupMemberInput,
  type ConvoyRegroupPlannerResult,
  type ConvoyRegroupProposal,
  type ConvoyRegroupStoppingSuitability,
  type ConvoyRegroupVehicleConstraints,
} from './convoyRegroupPlanner';

export interface ConvoyRegroupLocalContext {
  route: ImportedRoute | null;
  routeContext: RouteContext | null;
  pins: ECSPin[];
  bailouts: BailoutPoint[];
}

export interface ConvoyRegroupPlannerAdapterInput {
  enabled: boolean;
  positionSharingEnabled: boolean;
  memberLocationPermissionAllowed: boolean;
  activeConvoyId?: string | null;
  routeSession: NavigateRouteSessionSnapshot;
  trackingConnectionStatus: ConvoyRealtimeConnectionStatus;
  members: ConvoyMapVehicle[];
  localContext?: ConvoyRegroupLocalContext | null;
  expeditionId?: string | null;
  daylight?: ConvoyRegroupDaylightInput | null;
  vehicleConstraints?: ConvoyRegroupVehicleConstraints | null;
  now?: number | string | Date;
}

export interface ConvoyRegroupRallyDraft {
  proposalFingerprint: string;
  candidateId: string;
  candidateTitle: string;
  coordinate: { latitude: number; longitude: number };
  message: string;
  priority: 'normal';
  requireAcknowledgment: true;
  rallyLocation: 'waypoint';
  sourceTruth: SourceTruthRef;
  sourceTruthPolicyKey: SourceTruthPolicyKey;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}

function confidenceFromScore(confidence: Confidence | null | undefined): SourceTruthConfidence {
  const value = Number(confidence?.value);
  if (!Number.isFinite(value)) return 'unknown';
  if (value >= 75) return 'high';
  if (value >= 50) return 'medium';
  return 'low';
}

function confidenceFromAccuracy(accuracyMeters: number | null): SourceTruthConfidence {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return 'unknown';
  if (accuracyMeters <= 25) return 'high';
  if (accuracyMeters <= 100) return 'medium';
  return 'low';
}

function warningCodes(warnings: readonly RouteContextWarning[] | null | undefined): string[] {
  return unique((warnings ?? []).map((warning) => warning.code));
}

function sourceRef(args: {
  id: string;
  origin: SourceTruthOrigin;
  authority: string;
  provider?: string | null;
  observedAt?: string | null;
  expiresAt?: string | null;
  confidence: SourceTruthConfidence;
  coverage?: 'complete' | 'partial' | 'unknown';
  availability?: 'usable' | 'degraded' | 'unavailable';
  conflict?: boolean;
  warningCodes?: string[];
}): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: args.id,
    origin: args.origin,
    authority: args.authority,
    provider: args.provider ?? null,
    observedAt: args.observedAt ?? null,
    fetchedAt: null,
    expiresAt: args.expiresAt ?? null,
    confidence: args.confidence,
    coverage: args.coverage ?? 'unknown',
    availability: args.availability ?? 'usable',
    conflict: args.conflict === true,
    warningCodes: args.warningCodes ?? [],
  });
}

function memberOrigin(
  member: ConvoyMapVehicle,
  connectionStatus: ConvoyRealtimeConnectionStatus,
): SourceTruthOrigin {
  if (member.participantFixtureOnly || member.participantSource === 'mock' || member.participantSource === 'demo') {
    return 'simulated';
  }
  if (member.participantSource === 'cached') return 'cached';
  return connectionStatus === 'connected' ? 'live' : 'cached';
}

function adaptMember(
  member: ConvoyMapVehicle,
  connectionStatus: ConvoyRealtimeConnectionStatus,
): ConvoyRegroupMemberInput {
  const origin = memberOrigin(member, connectionStatus);
  const unavailable = member.movementStatus === 'offline';
  const warnings = unique([
    member.isStale ? 'convoy_location_stale' : null,
    member.staleness !== 'fresh' ? `convoy_location_${member.staleness}` : null,
    member.accuracyMeters == null ? 'convoy_location_accuracy_missing' : null,
    member.accuracyMeters != null && member.accuracyMeters > 100 ? 'convoy_location_accuracy_low' : null,
    origin === 'cached' ? 'convoy_location_cached' : null,
    origin === 'simulated' ? 'convoy_location_simulated' : null,
  ]);
  return {
    memberId: member.memberId,
    label: member.callsign || member.displayName || 'Convoy member',
    role: member.role,
    locationVisibility: 'visible',
    coordinate: { lat: member.latitude, lng: member.longitude },
    capturedAt: member.capturedAt,
    accuracyMeters: member.accuracyMeters,
    speedMps: member.speedMps,
    movementStatus: member.movementStatus,
    explicitlyStale: member.isStale,
    sourceTruth: sourceRef({
      id: `convoy-member-location-${member.memberId}`,
      origin,
      authority: 'ECS Convoy Realtime',
      provider: origin === 'live' ? 'Supabase Realtime' : 'ECS last-known convoy state',
      observedAt: member.capturedAt,
      confidence: confidenceFromAccuracy(member.accuracyMeters),
      coverage: member.accuracyMeters == null ? 'partial' : 'complete',
      availability: unavailable ? 'unavailable' : origin === 'live' ? 'usable' : 'degraded',
      warningCodes: warnings,
    }),
  };
}

function routeSourceTruth(routeSession: NavigateRouteSessionSnapshot): SourceTruthRef {
  const hasGeometry = routeSession.routePoints.length >= 2;
  return sourceRef({
    id: `navigate-route-session-${routeSession.routeId ?? 'none'}`,
    origin: hasGeometry ? 'cached' : 'unavailable',
    authority: 'ECS Navigate Route Session',
    provider: routeSession.source === 'none' ? null : routeSession.source,
    observedAt: routeSession.updatedAt,
    confidence: hasGeometry ? 'medium' : 'unknown',
    coverage: hasGeometry ? 'complete' : 'unknown',
    availability: hasGeometry ? 'usable' : 'unavailable',
    warningCodes: unique([
      'offline_capable_route_geometry',
      routeSession.updatedAt ? null : 'route_timestamp_missing',
      routeSession.isOffRoute ? 'navigate_session_off_route' : null,
    ]),
  });
}

function routeAverageSpeedMps(routeSession: NavigateRouteSessionSnapshot): number | null {
  const distance = Number(routeSession.remainingDistanceM);
  const duration = Number(routeSession.remainingDurationS);
  if (Number.isFinite(distance) && distance > 0 && Number.isFinite(duration) && duration > 0) {
    const average = distance / duration;
    return average >= 1 ? average : null;
  }
  const speedMph = Number(routeSession.currentLocation?.speedMph);
  return Number.isFinite(speedMph) && speedMph > 2.25 ? speedMph * 0.44704 : null;
}

function adapterNowMs(value: ConvoyRegroupPlannerAdapterInput['now']): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function routeDaylight(
  routeSession: NavigateRouteSessionSnapshot,
  now: ConvoyRegroupPlannerAdapterInput['now'],
): ConvoyRegroupDaylightInput | null {
  const anchor = routeSession.currentLocation
    ? {
        latitude: routeSession.currentLocation.latitude,
        longitude: routeSession.currentLocation.longitude,
        accuracyM: routeSession.currentLocation.accuracyM,
        source: 'gps' as const,
        updatedAt: routeSession.currentLocation.timestamp ?? routeSession.updatedAt,
      }
    : routeSession.routePoints[0]
      ? {
          latitude: routeSession.routePoints[0].lat,
          longitude: routeSession.routePoints[0].lng,
          source: 'route' as const,
          updatedAt: routeSession.updatedAt,
        }
      : null;
  if (!anchor) return null;
  const nowMs = adapterNowMs(now);
  const environment = buildEnvironmentSnapshot({ coordinate: anchor, nowMs });
  const sunlight = environment.sunlight;
  const confidence: SourceTruthConfidence = sunlight.confidence === 'high'
    ? 'high'
    : sunlight.confidence === 'medium'
      ? 'medium'
      : sunlight.confidence === 'low'
        ? 'low'
        : 'unknown';
  return {
    status: sunlight.status,
    sunsetAt: sunlight.sunsetIso,
    remainingMinutes: sunlight.nextEvent === 'sunset' ? sunlight.remainingMinutes : null,
    sourceTruth: sourceRef({
      id: `smart-rally-daylight-${routeSession.routeId ?? 'none'}`,
      origin: sunlight.source === 'weather_provider' ? 'live' : sunlight.source === 'unavailable' ? 'unavailable' : 'estimated',
      authority: sunlight.source === 'weather_provider' ? 'Operational Weather Broker' : 'ECS Environment Snapshot',
      provider: sunlight.source,
      observedAt: new Date(nowMs).toISOString(),
      expiresAt: sunlight.nextEventIso,
      confidence,
      coverage: sunlight.status === 'unavailable' ? 'unknown' : 'complete',
      availability: sunlight.status === 'unavailable' ? 'unavailable' : 'usable',
      warningCodes: environment.warnings,
    }),
  };
}

function routeOrigin(route: ImportedRoute | null): SourceTruthOrigin {
  if (!route) return 'unavailable';
  return route.sync_status === 'synced' ? 'cached' : 'manual';
}

function routeEntitySourceTruth(route: ImportedRoute): SourceTruthRef {
  return sourceRef({
    id: `route-store-${route.id}`,
    origin: routeOrigin(route),
    authority: 'ECS Route Store',
    provider: route.source_app ?? route.source_format,
    observedAt: route.updated_at,
    confidence: 'medium',
    coverage: 'complete',
    availability: 'usable',
    warningCodes: ['route_waypoint_stopping_status_unverified'],
  });
}

function waypointCandidateType(waypoint: RouteWaypoint): ConvoyRegroupCandidateType {
  if (waypoint.waypointType === 'camp') return 'camp';
  if (waypoint.waypointType === 'fuel' || waypoint.waypointType === 'water') return 'resupply';
  if (waypoint.waypointType === 'trailhead' || waypoint.waypointType === 'junction') return 'waypoint';
  return 'waypoint';
}

function candidateFromRouteWaypoint(
  route: ImportedRoute,
  waypoint: RouteWaypoint,
  index: number,
): ConvoyRegroupCandidateInput | null {
  if (waypoint.waypointType === 'hazard') return null;
  if (!Number.isFinite(waypoint.lat) || !Number.isFinite(waypoint.lon)) return null;
  const title = sanitizeSourceTruthDisplayText(waypoint.name, 120) ?? `Route waypoint ${index + 1}`;
  return {
    id: `route-waypoint:${route.id}:${index}`,
    title,
    type: waypointCandidateType(waypoint),
    coordinate: { lat: waypoint.lat, lng: waypoint.lon },
    access: 'unknown',
    stoppingSuitability: 'conditional',
    vehicleSuitability: 'unknown',
    trailerSuitability: 'unknown',
    sourceTruth: routeEntitySourceTruth(route),
    sourceTruthPolicyKey: 'offline_map_route_package',
    rationale: ['Explicit waypoint from the active or saved ECS route.'],
    warningCodes: ['waypoint_access_unverified', 'waypoint_stopping_suitability_unverified'],
    sourceEntity: { store: 'routeStore', id: `${route.id}:waypoint:${index}`, routeId: route.id, index },
  };
}

function hazardFromRouteWaypoint(
  route: ImportedRoute,
  waypoint: RouteWaypoint,
  index: number,
): ConvoyRegroupHazardInput | null {
  if (waypoint.waypointType !== 'hazard') return null;
  if (!Number.isFinite(waypoint.lat) || !Number.isFinite(waypoint.lon)) return null;
  return {
    id: `route-hazard:${route.id}:${index}`,
    title: sanitizeSourceTruthDisplayText(waypoint.name, 120) ?? `Route hazard ${index + 1}`,
    coordinate: { lat: waypoint.lat, lng: waypoint.lon },
    blocking: null,
    sourceTruth: routeEntitySourceTruth(route),
  };
}

function includePin(pin: ECSPin, expeditionId: string | null | undefined): boolean {
  if (!expeditionId) return false;
  return pin.expedition_id === expeditionId;
}

function pinSourceTruth(pin: ECSPin): SourceTruthRef {
  return sourceRef({
    id: `pin-store-${pin.id}`,
    origin: 'manual',
    authority: 'ECS Pin Store',
    provider: pin.created_by || 'local',
    observedAt: pin.created_at,
    confidence: 'medium',
    coverage: 'partial',
    availability: pin.resolved ? 'degraded' : 'usable',
    warningCodes: unique([
      'manual_location',
      pin.resolved ? 'pin_resolved' : null,
      'pin_access_unverified',
    ]),
  });
}

function candidateFromPin(pin: ECSPin): ConvoyRegroupCandidateInput | null {
  if (pin.category !== 'waypoint' || pin.resolved) return null;
  const type: ConvoyRegroupCandidateType = pin.type === 'camp'
    ? 'camp'
    : pin.type === 'fuel' || pin.type === 'water'
      ? 'resupply'
      : 'waypoint';
  return {
    id: `pin:${pin.id}`,
    title: sanitizeSourceTruthDisplayText(pin.title, 120) ?? 'Saved ECS waypoint',
    type,
    coordinate: { lat: pin.lat, lng: pin.lng },
    access: 'unknown',
    stoppingSuitability: 'conditional',
    vehicleSuitability: 'unknown',
    trailerSuitability: 'unknown',
    sourceTruth: pinSourceTruth(pin),
    sourceTruthPolicyKey: 'manual_user_state',
    rationale: ['Saved local ECS waypoint.'],
    warningCodes: ['manual_candidate', 'candidate_access_unverified'],
    sourceEntity: { store: 'pinStore', id: pin.id },
  };
}

function hazardFromPin(pin: ECSPin): ConvoyRegroupHazardInput | null {
  if (pin.category !== 'incident' || pin.type !== 'hazard' || pin.resolved) return null;
  return {
    id: `pin-hazard:${pin.id}`,
    title: sanitizeSourceTruthDisplayText(pin.title, 120) ?? 'Saved route hazard',
    coordinate: { lat: pin.lat, lng: pin.lng },
    // Pin severity alone is not enough evidence to assert that passage is blocked.
    blocking: null,
    sourceTruth: pinSourceTruth(pin),
  };
}

function bailoutCandidateType(point: BailoutPoint): ConvoyRegroupCandidateType {
  if (point.type === 'camp') return 'camp';
  if (point.type === 'fuel' || point.type === 'water' || point.type === 'supplies' || point.type === 'town') return 'resupply';
  return 'bailout';
}

function candidateFromBailout(point: BailoutPoint): ConvoyRegroupCandidateInput {
  return {
    id: `bailout:${point.id}`,
    title: sanitizeSourceTruthDisplayText(point.title, 120) ?? 'Saved bailout point',
    type: bailoutCandidateType(point),
    coordinate: { lat: point.lat, lng: point.lng },
    access: 'unknown',
    stoppingSuitability: 'conditional',
    vehicleSuitability: 'unknown',
    trailerSuitability: 'unknown',
    sourceTruth: sourceRef({
      id: `bailout-store-${point.id}`,
      origin: 'manual',
      authority: 'ECS Bailout Store',
      provider: point.is_shared ? 'shared local record' : 'local record',
      observedAt: point.created_at,
      confidence: 'medium',
      coverage: 'partial',
      availability: 'usable',
      warningCodes: ['manual_candidate', 'bailout_access_unverified'],
    }),
    sourceTruthPolicyKey: 'manual_user_state',
    rationale: ['Bailout or support point already associated with the active route.'],
    warningCodes: ['candidate_access_unverified', 'candidate_stopping_suitability_unverified'],
    sourceEntity: { store: 'bailoutStore', id: point.id },
  };
}

function contextSourceOrigin(context: RouteContext): SourceTruthOrigin {
  if (context.status === 'stale') return 'cached';
  if (context.status === 'ready' || context.status === 'partial') return 'inferred';
  return 'unavailable';
}

function routeContextSourceTruth(args: {
  context: RouteContext;
  id: string;
  source: string | null | undefined;
  confidence: Confidence | null | undefined;
  warnings: readonly RouteContextWarning[] | null | undefined;
}): SourceTruthRef {
  const origin = contextSourceOrigin(args.context);
  const warnings = warningCodes(args.warnings);
  return sourceRef({
    id: `route-context-${args.id}`,
    origin,
    authority: 'ECS Route Context Engine',
    provider: sanitizeSourceTruthDisplayText(args.source, 80),
    observedAt: args.context.updatedAt,
    expiresAt: args.context.expiresAt,
    confidence: confidenceFromScore(args.confidence),
    coverage: warnings.length > 0 || args.context.status === 'partial' ? 'partial' : 'complete',
    availability: origin === 'unavailable'
      ? 'unavailable'
      : origin === 'cached' || args.context.status === 'partial'
        ? 'degraded'
        : 'usable',
    warningCodes: warnings,
  });
}

function campAccess(candidate: CampCandidate): {
  access: ConvoyRegroupCandidateAccess;
  stopping: ConvoyRegroupStoppingSuitability;
} {
  if (
    candidate.accessStatus === 'closed' ||
    candidate.accessStatus === 'restricted' ||
    candidate.legalStatus === 'not_allowed' ||
    candidate.legalStatus === 'restricted'
  ) {
    return { access: 'prohibited', stopping: 'unsuitable' };
  }
  if (candidate.accessStatus === 'open' && candidate.legalStatus === 'explicitly_allowed') {
    return { access: 'verified_open', stopping: 'verified' };
  }
  return { access: 'unknown', stopping: 'conditional' };
}

function candidateFromContextCamp(context: RouteContext, candidate: CampCandidate): ConvoyRegroupCandidateInput {
  const access = campAccess(candidate);
  return {
    id: `route-context-camp:${candidate.id}`,
    title: sanitizeSourceTruthDisplayText(candidate.name, 120) ?? 'Route Context camp',
    type: 'camp',
    coordinate: { lat: candidate.lat, lng: candidate.lng },
    access: access.access,
    stoppingSuitability: access.stopping,
    vehicleSuitability: 'unknown',
    trailerSuitability: 'unknown',
    sourceTruth: routeContextSourceTruth({
      context,
      id: candidate.id,
      source: candidate.source,
      confidence: candidate.confidence,
      warnings: candidate.warnings,
    }),
    sourceTruthPolicyKey: 'camp_provider_availability',
    rationale: ['Normalized camp candidate from the cached Route Context Engine result.'],
    warningCodes: warningCodes(candidate.warnings),
    sourceEntity: { store: 'routeContextEngine', id: candidate.id, routeId: context.trailId },
  };
}

function candidateFromContextBailout(context: RouteContext, candidate: BailoutCandidate): ConvoyRegroupCandidateInput {
  const access: ConvoyRegroupCandidateAccess = candidate.reachableByVehicle === false
    ? 'prohibited'
    : candidate.reachableByVehicle === true
      ? 'verified_open'
      : 'unknown';
  return {
    id: `route-context-bailout:${candidate.id}`,
    title: sanitizeSourceTruthDisplayText(candidate.label, 120) ?? 'Route Context bailout',
    type: 'bailout',
    coordinate: { lat: candidate.lat, lng: candidate.lng },
    access,
    stoppingSuitability: candidate.reachableByVehicle === false ? 'unsuitable' : 'conditional',
    vehicleSuitability: candidate.reachableByVehicle === false
      ? 'unsuitable'
      : candidate.reachableByVehicle === true
        ? 'conditional'
        : 'unknown',
    trailerSuitability: 'unknown',
    sourceTruth: routeContextSourceTruth({
      context,
      id: candidate.id,
      source: candidate.source,
      confidence: candidate.confidence,
      warnings: candidate.warnings,
    }),
    sourceTruthPolicyKey: 'route_legal_access_evidence',
    rationale: ['Normalized bailout candidate from the cached Route Context Engine result.'],
    warningCodes: unique([...warningCodes(candidate.warnings), 'stopping_suitability_unverified']),
    sourceEntity: { store: 'routeContextEngine', id: candidate.id, routeId: context.trailId },
  };
}

function candidateFromContextSupply(context: RouteContext, candidate: SupplyCandidate): ConvoyRegroupCandidateInput {
  const access: ConvoyRegroupCandidateAccess = candidate.openStatus === 'open'
    ? 'verified_open'
    : candidate.openStatus === 'closed' || candidate.openStatus === 'temporarily_closed'
      ? 'closed'
      : 'unknown';
  return {
    id: `route-context-supply:${candidate.id}`,
    title: sanitizeSourceTruthDisplayText(candidate.name, 120) ?? 'Route Context resupply',
    type: 'resupply',
    coordinate: { lat: candidate.lat, lng: candidate.lng },
    access,
    stoppingSuitability: access === 'closed' ? 'unsuitable' : 'conditional',
    vehicleSuitability: 'unknown',
    trailerSuitability: 'unknown',
    sourceTruth: routeContextSourceTruth({
      context,
      id: candidate.id,
      source: 'Route Context supply provider',
      confidence: candidate.confidence,
      warnings: candidate.warnings,
    }),
    sourceTruthPolicyKey: 'condition_closure_advisory',
    rationale: ['Normalized resupply candidate from the cached Route Context Engine result.'],
    warningCodes: unique([...warningCodes(candidate.warnings), 'stopping_suitability_unverified']),
    sourceEntity: { store: 'routeContextEngine', id: candidate.id, routeId: context.trailId },
  };
}

function dedupeCandidates(candidates: ConvoyRegroupCandidateInput[]): ConvoyRegroupCandidateInput[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.id}:${candidate.coordinate.lat.toFixed(5)}:${candidate.coordinate.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readConvoyRegroupLocalContext(args: {
  routeId?: string | null;
}): ConvoyRegroupLocalContext {
  const routeId = String(args.routeId ?? '').trim();
  if (!routeId) {
    return { route: null, routeContext: null, pins: [], bailouts: [] };
  }
  return {
    route: routeStore.getById(routeId),
    routeContext: routeContextOrchestrator.getJobSnapshot({ trailId: routeId })?.context ?? null,
    pins: pinStore.getAll(),
    bailouts: bailoutStore.getRunBailouts(routeId),
  };
}

export function buildConvoyRegroupCandidateContext(args: {
  localContext?: ConvoyRegroupLocalContext | null;
  expeditionId?: string | null;
}): { candidates: ConvoyRegroupCandidateInput[]; hazards: ConvoyRegroupHazardInput[] } {
  const local = args.localContext;
  if (!local) return { candidates: [], hazards: [] };
  const routeCandidates = (local.route?.waypoints ?? []).flatMap((waypoint, index) => {
    const candidate = local.route ? candidateFromRouteWaypoint(local.route, waypoint, index) : null;
    return candidate ? [candidate] : [];
  });
  const routeHazards = (local.route?.waypoints ?? []).flatMap((waypoint, index) => {
    const hazard = local.route ? hazardFromRouteWaypoint(local.route, waypoint, index) : null;
    return hazard ? [hazard] : [];
  });
  const scopedPins = local.pins.filter((pin) => includePin(pin, args.expeditionId));
  const pinCandidates = scopedPins.flatMap((pin) => {
    const candidate = candidateFromPin(pin);
    return candidate ? [candidate] : [];
  });
  const pinHazards = scopedPins.flatMap((pin) => {
    const hazard = hazardFromPin(pin);
    return hazard ? [hazard] : [];
  });
  const contextCandidates = local.routeContext
    ? [
        ...local.routeContext.campCandidates.map((candidate) => candidateFromContextCamp(local.routeContext as RouteContext, candidate)),
        ...local.routeContext.bailoutCandidates.map((candidate) => candidateFromContextBailout(local.routeContext as RouteContext, candidate)),
        ...local.routeContext.supplyCandidates.map((candidate) => candidateFromContextSupply(local.routeContext as RouteContext, candidate)),
      ]
    : [];
  return {
    candidates: dedupeCandidates([
      ...contextCandidates,
      ...routeCandidates,
      ...pinCandidates,
      ...local.bailouts.map(candidateFromBailout),
    ]),
    hazards: [...routeHazards, ...pinHazards],
  };
}

export function selectConvoyRegroupPlannerResult(
  input: ConvoyRegroupPlannerAdapterInput,
): ConvoyRegroupPlannerResult {
  const routeActive = input.routeSession.lifecycle === 'active' && Boolean(input.routeSession.routeId);
  const candidateContext = input.memberLocationPermissionAllowed && input.positionSharingEnabled
    ? buildConvoyRegroupCandidateContext({
        localContext: input.localContext,
        expeditionId: input.expeditionId,
      })
    : { candidates: [], hazards: [] };
  return planConvoyRegroup({
    enabled: input.enabled,
    positionSharingEnabled: input.positionSharingEnabled,
    memberLocationPermissionAllowed: input.memberLocationPermissionAllowed,
    activeConvoyId: input.activeConvoyId,
    route: routeActive
      ? {
          id: input.routeSession.routeId as string,
          title: input.routeSession.routeTitle,
          coordinates: input.routeSession.routePoints,
          averageSpeedMps: routeAverageSpeedMps(input.routeSession),
          sourceTruth: routeSourceTruth(input.routeSession),
        }
      : null,
    members: input.members.map((member) => adaptMember(member, input.trackingConnectionStatus)),
    candidates: candidateContext.candidates,
    hazards: candidateContext.hazards,
    daylight: input.daylight ?? routeDaylight(input.routeSession, input.now),
    vehicleConstraints: input.vehicleConstraints ?? null,
    now: input.now,
  });
}

function linkedContextType(type: ConvoyRegroupCandidateType): DispatchLinkedContextType {
  switch (type) {
    case 'rally':
      return 'rally';
    case 'camp':
      return 'camp';
    case 'resupply':
      return 'resource';
    case 'bailout':
    case 'turnaround':
    case 'staging':
      return 'bailout';
    case 'waypoint':
      return 'waypoint';
    case 'verified_context':
    default:
      return 'pin';
  }
}

function contextPolicyKey(proposal: ConvoyRegroupProposal): SourceTruthPolicyKey {
  return proposal.candidate.candidate.sourceTruthPolicyKey ?? 'manual_user_state';
}

export function createConvoyRegroupDispatchContext(
  proposal: ConvoyRegroupProposal,
): DispatchLinkedContext {
  const candidate = proposal.candidate.candidate;
  const sourceEntity = candidate.sourceEntity;
  const metadata: Record<string, unknown> = {
    source: sourceEntity?.store ?? 'convoyRegroupPlanner',
    proposalFingerprint: proposal.fingerprint,
    routeId: sourceEntity?.routeId ?? null,
    waypointIndex: sourceEntity?.index ?? null,
    previewOnly: true,
  };
  if (sourceEntity?.store === 'pinStore') metadata.pinId = sourceEntity.id;
  if (sourceEntity?.store === 'bailoutStore') metadata.bailoutId = sourceEntity.id;
  const sourceTruthPolicyKey = contextPolicyKey(proposal);
  const sourceEvaluation = evaluateSourceTruthRef(candidate.sourceTruth, {
    policyKey: sourceTruthPolicyKey,
  });
  return {
    id: `convoy-regroup-${proposal.fingerprint}`,
    type: linkedContextType(candidate.type),
    title: candidate.title,
    subtitle: 'Smart Rally proposal preview. No route or guidance change has been accepted.',
    coordinates: {
      latitude: candidate.coordinate.lat,
      longitude: candidate.coordinate.lng,
    },
    observedAt: candidate.sourceTruth.observedAt ?? undefined,
    stale: sourceEvaluation.freshness === 'stale' || sourceEvaluation.freshness === 'expired',
    sourceTruthPolicyKey,
    sourceTruth: candidate.sourceTruth,
    metadata,
  };
}

function formatEtaWindow(proposal: ConvoyRegroupProposal): string {
  const eta = proposal.candidate.etaWindow;
  if (!eta) return 'ETA range unavailable';
  const earliest = Math.max(0, Math.round(eta.earliestSeconds / 60));
  const latest = Math.max(earliest, Math.round(eta.latestSeconds / 60));
  return earliest === latest ? `${earliest} min ETA` : `${earliest}-${latest} min ETA range`;
}

export function createConvoyRegroupRallyDraft(
  proposal: ConvoyRegroupProposal,
): ConvoyRegroupRallyDraft {
  const candidate = proposal.candidate.candidate;
  const title = sanitizeSourceTruthDisplayText(candidate.title, 120) ?? 'proposed regroup point';
  return {
    proposalFingerprint: proposal.fingerprint,
    candidateId: candidate.id,
    candidateTitle: title,
    coordinate: {
      latitude: candidate.coordinate.lat,
      longitude: candidate.coordinate.lng,
    },
    message: [
      `Smart Rally proposal: ${title}.`,
      `${formatEtaWindow(proposal)}.`,
      'Verify current access and stopping conditions before proceeding.',
      'Acknowledge when en route.',
      'ECS team coordination only.',
    ].join(' '),
    priority: 'normal',
    requireAcknowledgment: true,
    rallyLocation: 'waypoint',
    sourceTruth: candidate.sourceTruth,
    sourceTruthPolicyKey: contextPolicyKey(proposal),
  };
}

import type { BailoutPoint } from './bailoutStore';
import type { MissionCommandActor } from './dispatchMissionCommandTypes';
import type { ECSWeatherSnapshot } from './ecsWeather';
import {
  type RouteBlockageAlternateCandidate,
  type RouteBlockageCreateInput,
  type RouteBlockageEvidenceInput,
  type RouteBlockageMemberRef,
  type RouteBlockageReportedCondition,
  type RouteBlockageReportSourceKind,
} from './dispatchRouteBlockagePlaybook';
import type { DispatchLinkedContext } from './dispatchTypes';
import type { NavigateRouteSessionSnapshot } from './navigateRouteSessionStore';
import type {
  OfflineReadinessAudit,
  OfflineReadinessManifest,
} from './offlinePrepPack/offlineReadinessManifest';
import {
  haversineDistanceMeters,
  nearestPointOnRoute,
} from './routeContext/routeContextGeometry';
import {
  compareRoutePlans,
  type RouteImpactMeasure,
  type RouteImpactPlan,
} from './routeImpact/routeChangeImpact';
import type { ImportedRoute } from './routeStore';
import {
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthRef,
} from './sourceTruth';

const ACTIVE_ROUTE_AFFECTED_DISTANCE_M = 75;
const ACTIVE_ROUTE_NEAR_DISTANCE_M = 250;
const MAX_ALTERNATE_CANDIDATES = 5;
const MAX_BAILOUT_CANDIDATES = 12;

export interface BuildRouteBlockageRuntimeInput {
  expeditionId: string;
  actor: MissionCommandActor;
  soloMode: boolean;
  online: boolean;
  reportSourceKind: RouteBlockageReportSourceKind;
  reportedCondition: RouteBlockageReportedCondition;
  reporter: RouteBlockageMemberRef;
  affectedMembers: RouteBlockageMemberRef[];
  observationTime?: string | number | Date;
  confidence?: SourceTruthRef['confidence'];
  locationContext?: DispatchLinkedContext | null;
  locationPermitted: boolean;
  activeRouteSession?: NavigateRouteSessionSnapshot | null;
  activeRouteContext?: DispatchLinkedContext | null;
  activeRouteSegmentContext?: DispatchLinkedContext | null;
  savedRoutes?: ImportedRoute[];
  legalAccessEvidence?: RouteBlockageEvidenceInput | null;
  currentConditionEvidence?: RouteBlockageEvidenceInput | null;
  weatherFireEvidence?: RouteBlockageEvidenceInput | null;
  bailouts?: BailoutPoint[];
  campCandidate?: { id?: string | null; name?: string | null } | null;
  offlineManifest?: OfflineReadinessManifest | null;
  offlineAudit?: OfflineReadinessAudit | null;
  reviewMinutes?: number;
  now?: string | number | Date;
  idempotencyKey?: string;
}

export function buildRouteBlockageRuntimeInput(
  input: BuildRouteBlockageRuntimeInput,
): RouteBlockageCreateInput {
  const now = normalizeIso(input.now) ?? new Date().toISOString();
  const observationTime = normalizeIso(input.observationTime) ?? now;
  const reportSource = reportSourceTruth(input, observationTime);
  const session = input.activeRouteSession ?? null;
  const activeRouteContext = input.activeRouteContext ?? buildActiveRouteContext(session, now);
  const location = input.locationPermitted ? input.locationContext ?? null : restrictedLocation(input.locationContext);
  const proximity = deriveRouteProximity(location, session);
  const routeSegmentContext = input.activeRouteSegmentContext ?? buildRouteSegmentContext({
    session,
    activeRouteContext,
    location,
    proximity,
    now,
  });
  const activeRouteSource = activeRouteContext?.sourceTruth ?? routeSource(
    `active-route:${session?.routeId ?? 'unknown'}`,
    session?.updatedAt ?? now,
    'Navigate route session',
    session?.routeId ? 'cached' : 'unavailable',
  );
  const alternates = buildAlternateCandidates({
    activeRouteSession: session,
    activeRouteSource,
    savedRoutes: input.savedRoutes ?? [],
    offlineManifest: input.offlineManifest ?? null,
    now,
  });
  const bailoutContext = selectBailoutContext(location, input.bailouts ?? [], now);
  const campReassessment = deriveCampReassessment(alternates, input.campCandidate ?? null);
  const offlineReadiness = deriveOfflineReadiness(input.offlineManifest ?? null, input.offlineAudit ?? null);

  return {
    expeditionId: input.expeditionId,
    actor: input.actor,
    soloMode: input.soloMode,
    online: input.online,
    reportSourceKind: input.reportSourceKind,
    reportedCondition: input.reportedCondition,
    reporter: input.reporter,
    affectedMembers: input.affectedMembers,
    observationTime,
    confidence: normalizeConfidence(input.confidence),
    reportSourceTruth: [reportSource],
    locationContext: location,
    locationPermitted: input.locationPermitted,
    activeRouteContext,
    activeRouteSegmentContext: routeSegmentContext,
    routeImpactState: proximity.state,
    routeImpactLabel: proximity.label,
    legalAccessEvidence: input.legalAccessEvidence ?? unavailableEvidence(
      'No official legal/access evidence is attached to this report.',
      'unknown',
      'route_legal_access_evidence',
      now,
    ),
    currentConditionEvidence: input.currentConditionEvidence ?? unavailableEvidence(
      'No separate current-condition advisory is attached to this report.',
      'unknown',
      'condition_closure_advisory',
      now,
    ),
    weatherFireEvidence: input.weatherFireEvidence ?? unavailableEvidence(
      'Weather and fire context is unavailable.',
      'weather_fire_context',
      'weather_observation',
      now,
    ),
    alternateCandidates: alternates,
    bailoutContext,
    campReassessmentState: campReassessment.state,
    campImpactLabel: campReassessment.label,
    offlineReadinessState: offlineReadiness.state,
    offlineReadinessLabel: offlineReadiness.label,
    reviewMinutes: input.reviewMinutes,
    now,
    idempotencyKey: input.idempotencyKey,
  };
}

export function buildRouteBlockageWeatherFireEvidence(
  snapshot: ECSWeatherSnapshot,
): RouteBlockageEvidenceInput {
  const state: RouteBlockageEvidenceInput['state'] = snapshot.fetchedAt
    ? snapshot.status.stale ? 'stale' : 'available'
    : 'unavailable';
  return {
    label: snapshot.fetchedAt
      ? [
          snapshot.current.condition ?? snapshot.current.description ?? 'Weather observation',
          snapshot.alerts.length > 0
            ? `${snapshot.alerts.length} weather alert${snapshot.alerts.length === 1 ? '' : 's'}`
            : 'No provider weather alerts in this snapshot',
          'Fire closure status is not inferred from weather data',
        ].join(' / ')
      : 'Weather and fire context is unavailable.',
    state,
    kind: 'weather_fire_context',
    observedAt: snapshot.fetchedAt,
    sourceTruth: [sanitizeSourceTruthRef({
      id: `dispatch-route-blockage-weather:${snapshot.provider.id || 'unavailable'}`,
      origin: state === 'available' ? 'live' : state === 'stale' ? 'cached' : 'unavailable',
      role: 'supporting',
      policyKey: 'weather_observation',
      authority: snapshot.provider.name || 'Operational weather broker',
      authorityKind: state === 'unavailable' ? 'unknown' : 'provider',
      provider: snapshot.provider.id || null,
      observedAt: snapshot.fetchedAt,
      confidence: state === 'available' ? 'medium' : state === 'stale' ? 'low' : 'unknown',
      coverage: state === 'unavailable' ? 'unknown' : 'partial',
      availability: state === 'unavailable' ? 'unavailable' : state === 'stale' ? 'degraded' : 'usable',
      conflictState: 'none',
      warningCodes: state === 'stale'
        ? ['cached_source', 'fire_status_not_inferred']
        : state === 'unavailable'
          ? ['source_unavailable', 'fire_status_not_inferred']
          : ['fire_status_not_inferred'],
    })],
  };
}

function deriveRouteProximity(
  location: DispatchLinkedContext | null,
  session: NavigateRouteSessionSnapshot | null,
): {
  state: RouteBlockageCreateInput['routeImpactState'];
  label: string;
  distanceMeters: number | null;
  segmentIndex: number | null;
} {
  if (!location?.coordinates || location.restricted || !session?.routePoints.length) {
    return {
      state: 'unknown',
      label: 'Active-route impact is unknown because permitted blockage coordinates or route geometry are unavailable.',
      distanceMeters: null,
      segmentIndex: null,
    };
  }
  const nearest = nearestPointOnRoute(
    { lat: location.coordinates.latitude, lng: location.coordinates.longitude },
    session.routePoints,
  );
  if (!nearest) {
    return {
      state: 'unknown',
      label: 'Active-route impact is unknown because geometry comparison could not be completed.',
      distanceMeters: null,
      segmentIndex: null,
    };
  }
  const rounded = Math.round(nearest.distanceMeters);
  if (nearest.distanceMeters <= ACTIVE_ROUTE_AFFECTED_DISTANCE_M) {
    return {
      state: 'affects_active_route',
      label: `Reported location is ${rounded} m from active route geometry and is treated as affecting the active route for operator review.`,
      distanceMeters: nearest.distanceMeters,
      segmentIndex: nearest.segmentIndex,
    };
  }
  if (nearest.distanceMeters <= ACTIVE_ROUTE_NEAR_DISTANCE_M) {
    return {
      state: 'near_active_route',
      label: `Reported location is ${rounded} m from active route geometry. Route impact requires operator verification.`,
      distanceMeters: nearest.distanceMeters,
      segmentIndex: nearest.segmentIndex,
    };
  }
  return {
    state: 'outside_active_route',
    label: `Reported location is ${rounded} m from current route geometry. This comparison does not establish that the active route is passable.`,
    distanceMeters: nearest.distanceMeters,
    segmentIndex: nearest.segmentIndex,
  };
}

function buildActiveRouteContext(
  session: NavigateRouteSessionSnapshot | null,
  now: string,
): DispatchLinkedContext | null {
  if (!session?.routeId) return null;
  const source = routeSource(
    `navigate-route:${session.routeId}`,
    session.updatedAt ?? now,
    'Navigate route session',
    'cached',
  );
  return {
    id: session.routeId,
    type: 'route',
    title: session.routeTitle?.trim() || 'Active route',
    subtitle: session.statusLabel,
    observedAt: session.updatedAt ?? now,
    stale: false,
    sourceTruthPolicyKey: 'manual_user_state',
    sourceTruth: source,
    metadata: {
      lifecycle: session.lifecycle,
      source: session.source,
      sessionId: session.sessionId,
    },
  };
}

function buildRouteSegmentContext(input: {
  session: NavigateRouteSessionSnapshot | null;
  activeRouteContext: DispatchLinkedContext | null;
  location: DispatchLinkedContext | null;
  proximity: ReturnType<typeof deriveRouteProximity>;
  now: string;
}): DispatchLinkedContext | null {
  if (!input.session?.routeId || input.proximity.segmentIndex == null) return null;
  const point = input.session.routePoints[Math.min(
    input.proximity.segmentIndex,
    input.session.routePoints.length - 1,
  )];
  const source = input.activeRouteContext?.sourceTruth ?? routeSource(
    `navigate-route-segment:${input.session.routeId}`,
    input.session.updatedAt ?? input.now,
    'Navigate route geometry',
    'cached',
  );
  return {
    id: `${input.session.routeId}:segment:${input.proximity.segmentIndex}`,
    type: 'route_segment',
    title: `${input.session.routeTitle ?? 'Active route'} / segment ${input.proximity.segmentIndex + 1}`,
    routeSegmentId: `${input.session.routeId}:segment:${input.proximity.segmentIndex}`,
    coordinates: input.location?.restricted || !point ? undefined : {
      latitude: point.lat,
      longitude: point.lng,
    },
    observedAt: input.session.updatedAt ?? input.now,
    sourceTruthPolicyKey: source.policyKey ?? 'manual_user_state',
    sourceTruth: source,
    metadata: {
      distanceFromReportMeters: input.proximity.distanceMeters == null
        ? null
        : Math.round(input.proximity.distanceMeters),
    },
  };
}

function buildAlternateCandidates(input: {
  activeRouteSession: NavigateRouteSessionSnapshot | null;
  activeRouteSource: SourceTruthRef;
  savedRoutes: ImportedRoute[];
  offlineManifest: OfflineReadinessManifest | null;
  now: string;
}): RouteBlockageAlternateCandidate[] {
  const activeId = input.activeRouteSession?.routeId ?? null;
  const baseline = buildActiveRouteImpactPlan(
    input.activeRouteSession,
    input.activeRouteSource,
    input.offlineManifest,
  );
  return input.savedRoutes
    .filter((route) => route.id !== activeId && route.segments.some((segment) => segment.points.length > 1))
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
    .slice(0, MAX_ALTERNATE_CANDIDATES)
    .map((route) => {
      const source = routeSource(
        `saved-route:${route.id}`,
        route.updated_at,
        route.source_app?.trim() || 'ECS saved route',
        'cached',
      );
      const candidate = buildSavedRouteImpactPlan(route, source);
      const comparison = compareRoutePlans({ baseline, candidate, now: input.now });
      return {
        id: route.id,
        label: route.name,
        context: {
          id: route.id,
          type: 'route',
          title: route.name,
          subtitle: `${route.total_distance_miles.toFixed(1)} mi saved route / review only`,
          observedAt: route.updated_at,
          sourceTruthPolicyKey: source.policyKey ?? 'manual_user_state',
          sourceTruth: source,
          metadata: {
            sourceFormat: route.source_format,
            sourceFingerprint: route.source_fingerprint ?? null,
            guidanceMutationAllowed: false,
          },
        },
        comparisonOutcome: comparison.outcome,
        comparisonSummary: comparison.summary,
        materialCategories: comparison.materialCategories.map((item) => item.category),
        requiredUnknownCategories: comparison.requiredUnknownCategories,
        sourceTruth: [source],
      };
    });
}

function buildActiveRouteImpactPlan(
  session: NavigateRouteSessionSnapshot | null,
  source: SourceTruthRef,
  manifest: OfflineReadinessManifest | null,
): RouteImpactPlan {
  const distance = finite(session?.remainingDistanceM) ? session!.remainingDistanceM : null;
  const duration = finite(session?.remainingDurationS) ? session!.remainingDurationS : null;
  const offlineCoverage = manifest
    ? offlineCoveragePercent(manifest)
    : null;
  return {
    id: session?.routeId ?? 'active-route-unknown',
    label: session?.routeTitle ?? 'Current route',
    kind: 'active',
    measures: {
      distance: measure(distance, distance == null ? null : `${(distance / 1609.344).toFixed(1)} mi`, 'm', 'lower_is_better', source, distance == null ? ['remaining distance'] : []),
      drive_time: measure(duration, duration == null ? null : `${Math.round(duration / 60)} min`, 's', 'lower_is_better', source, duration == null ? ['remaining duration'] : []),
      offline_coverage: measure(offlineCoverage, offlineCoverage == null ? null : `${Math.round(offlineCoverage)}%`, '%', 'higher_is_better', source, offlineCoverage == null ? ['active route offline manifest'] : [], true),
    },
    warnings: ['Active route remains unchanged by this comparison.'],
  };
}

function buildSavedRouteImpactPlan(route: ImportedRoute, source: SourceTruthRef): RouteImpactPlan {
  const distance = finite(route.total_distance_miles) ? route.total_distance_miles * 1609.344 : null;
  return {
    id: route.id,
    label: route.name,
    kind: 'alternate',
    geometryFingerprint: route.source_fingerprint ?? null,
    measures: {
      distance: measure(distance, distance == null ? null : `${route.total_distance_miles.toFixed(1)} mi`, 'm', 'lower_is_better', source, distance == null ? ['alternate route distance'] : []),
      drive_time: measure(null, null, 's', 'lower_is_better', source, ['alternate route drive time']),
      offline_coverage: measure(null, null, '%', 'higher_is_better', source, ['alternate route offline manifest'], true),
      legal_access: measure(null, null, null, 'higher_is_better', source, ['alternate route legal/access evidence'], true),
      current_conditions: measure(null, null, null, 'higher_is_better', source, ['alternate route current-condition evidence'], true),
    },
    warnings: ['Alternate is a saved planning candidate only and is not activated.'],
  };
}

function measure(
  value: number | null,
  displayValue: string | null,
  unit: string | null,
  preference: RouteImpactMeasure['preference'],
  sourceTruth: SourceTruthRef,
  missingInputs: string[],
  requiredForSafety = false,
): RouteImpactMeasure {
  return {
    value,
    displayValue,
    unit,
    preference,
    sourceTruth,
    freshnessPolicyKey: sourceTruth.policyKey ?? 'manual_user_state',
    missingInputs,
    requiredForSafety,
  };
}

function selectBailoutContext(
  location: DispatchLinkedContext | null,
  bailouts: BailoutPoint[],
  now: string,
): DispatchLinkedContext | null {
  const candidates = bailouts.slice(0, MAX_BAILOUT_CANDIDATES);
  if (candidates.length === 0) return null;
  const reportPoint = location?.restricted || !location?.coordinates
    ? null
    : { lat: location.coordinates.latitude, lng: location.coordinates.longitude };
  const selected = [...candidates].sort((left, right) => {
    if (!reportPoint) return left.priority - right.priority;
    const leftDistance = haversineDistanceMeters(reportPoint, { lat: left.lat, lng: left.lng }) ?? Number.POSITIVE_INFINITY;
    const rightDistance = haversineDistanceMeters(reportPoint, { lat: right.lat, lng: right.lng }) ?? Number.POSITIVE_INFINITY;
    return leftDistance - rightDistance;
  })[0];
  const source = routeSource(`bailout:${selected.id}`, selected.created_at ?? now, 'ECS bailout store', 'cached');
  return {
    id: selected.id,
    type: 'bailout',
    title: selected.title,
    subtitle: `${selected.type.replace(/_/g, ' ')} / operator review only`,
    coordinates: { latitude: selected.lat, longitude: selected.lng },
    observedAt: selected.created_at ?? now,
    sourceTruthPolicyKey: source.policyKey ?? 'manual_user_state',
    sourceTruth: source,
    metadata: { priority: selected.priority, shared: selected.is_shared },
  };
}

function deriveCampReassessment(
  alternates: RouteBlockageAlternateCandidate[],
  camp: BuildRouteBlockageRuntimeInput['campCandidate'],
): {
  state: RouteBlockageCreateInput['campReassessmentState'];
  label: string;
} {
  if (!camp) {
    return { state: 'unknown', label: 'No current CampOps endpoint is available for route-impact reassessment.' };
  }
  const material = alternates.some((candidate) => candidate.materialCategories.some((category) => (
    category === 'distance' || category === 'drive_time' || category === 'arrival_time' ||
    category === 'daylight_margin' || category === 'camp_viability'
  )));
  if (material) {
    return {
      state: 'recommended',
      label: `Route comparison materially affects arrival assumptions for ${camp.name?.trim() || 'the current camp endpoint'}. Request a fresh CampOps assessment before changing the plan.`,
    };
  }
  if (alternates.length > 0) {
    return {
      state: 'not_material',
      label: `Current comparison has no measured material arrival or endpoint impact for ${camp.name?.trim() || 'the current camp endpoint'}; unknown categories remain visible.`,
    };
  }
  return {
    state: 'unknown',
    label: `Camp impact for ${camp.name?.trim() || 'the current camp endpoint'} is unknown until a comparable route candidate is available.`,
  };
}

function deriveOfflineReadiness(
  manifest: OfflineReadinessManifest | null,
  audit: OfflineReadinessAudit | null,
): {
  state: RouteBlockageCreateInput['offlineReadinessState'];
  label: string;
} {
  if (!manifest) return { state: 'missing', label: 'No Offline Readiness Manifest is available for the active route.' };
  if (!audit) return { state: 'unknown', label: 'Offline package exists, but its departure audit is unavailable.' };
  if (audit.status === 'ready') return { state: 'ready', label: audit.summary };
  if (audit.status === 'caution') return { state: 'caution', label: audit.summary };
  return { state: 'blocked', label: audit.summary };
}

function offlineCoveragePercent(manifest: OfflineReadinessManifest): number | null {
  const required = manifest.assets.filter((asset) => asset.required);
  if (required.length === 0) return null;
  const ready = required.filter((asset) => asset.status === 'ready' && asset.coverage === 'complete');
  return (ready.length / required.length) * 100;
}

function restrictedLocation(context: DispatchLinkedContext | null | undefined): DispatchLinkedContext | null {
  if (!context) return null;
  return {
    ...context,
    coordinates: undefined,
    restricted: true,
    metadata: undefined,
  };
}

function reportSourceTruth(
  input: BuildRouteBlockageRuntimeInput,
  observedAt: string,
): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id: `route-blockage-report:${input.reporter.id}:${observedAt}`,
    origin: 'manual',
    role: 'primary',
    policyKey: 'condition_closure_advisory',
    authority: input.reporter.label,
    authorityKind: input.reportSourceKind === 'community_report' ? 'community' : 'user',
    observedAt,
    confidence: normalizeConfidence(input.confidence),
    coverage: 'partial',
    availability: 'usable',
    conflictState: 'none',
    warningCodes: ['manual_source', 'not_official_closure_evidence'],
  });
}

function unavailableEvidence(
  label: string,
  kind: RouteBlockageEvidenceInput['kind'],
  policyKey: NonNullable<SourceTruthRef['policyKey']>,
  now: string,
): RouteBlockageEvidenceInput {
  return {
    label,
    state: 'unavailable',
    kind,
    observedAt: null,
    sourceTruth: [sanitizeSourceTruthRef({
      id: `route-blockage-unavailable:${kind}`,
      origin: 'unavailable',
      role: 'primary',
      policyKey,
      authority: 'Unavailable',
      authorityKind: 'unknown',
      observedAt: null,
      fetchedAt: now,
      confidence: 'unknown',
      coverage: 'unknown',
      availability: 'unavailable',
      conflictState: 'none',
      warningCodes: ['source_unavailable'],
    })],
  };
}

function routeSource(
  id: string,
  observedAt: string,
  authority: string,
  origin: SourceTruthRef['origin'],
): SourceTruthRef {
  return sanitizeSourceTruthRef({
    id,
    origin,
    role: 'primary',
    policyKey: 'manual_user_state',
    authority,
    authorityKind: origin === 'unavailable' ? 'unknown' : 'ecs',
    observedAt: origin === 'unavailable' ? null : normalizeIso(observedAt) ?? null,
    confidence: origin === 'unavailable' ? 'unknown' : 'medium',
    coverage: origin === 'unavailable' ? 'unknown' : 'partial',
    availability: origin === 'unavailable' ? 'unavailable' : 'usable',
    conflictState: 'none',
    warningCodes: origin === 'unavailable' ? ['source_unavailable'] : ['planning_reference'],
  });
}

function normalizeConfidence(value: unknown): SourceTruthRef['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'unknown';
}

function normalizeIso(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).toISOString() : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeText(value: unknown, max: number): string {
  return sanitizeSourceTruthDisplayText(value, max) ?? '';
}

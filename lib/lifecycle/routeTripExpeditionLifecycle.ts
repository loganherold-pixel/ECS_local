export const ECS_JOURNEY_SCHEMA_VERSION = 'ecs.journey.v1' as const;

export type ECSJourneyPhase =
  | 'discovered'
  | 'previewing'
  | 'planned'
  | 'offline_ready'
  | 'expedition_ready'
  | 'staged'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'archived';

export type ECSJourneyEntityKind =
  | 'discovery_route'
  | 'route_asset'
  | 'trip_plan'
  | 'offline_package'
  | 'expedition'
  | 'navigation_session'
  | 'guidance_session'
  | 'recorded_run'
  | 'completed_outcome'
  | 'archive_record';

export type ECSRouteOrigin =
  | 'catalog'
  | 'trail_pack'
  | 'ai_idea'
  | 'imported'
  | 'route_builder'
  | 'stitched'
  | 'saved'
  | 'recorded_run'
  | 'legacy'
  | 'unknown';

export type ECSGeometryProvenanceKind =
  | 'official_geometry'
  | 'provider_geometry'
  | 'imported_geometry'
  | 'recorded_trace'
  | 'snapped_trace'
  | 'stitched_geometry'
  | 'manual_geometry'
  | 'preview_geometry'
  | 'unknown';

export interface ECSJourneyIdentity {
  schemaVersion: typeof ECS_JOURNEY_SCHEMA_VERSION;
  discoveryId: string | null;
  routeAssetId: string | null;
  tripPlanId: string | null;
  offlinePackageId: string | null;
  expeditionId: string | null;
  navigationSessionId: string | null;
  guidanceSessionId: string | null;
  recordedRunId: string | null;
  completedOutcomeId: string | null;
  archiveRecordId: string | null;
}

export interface ECSGeometryProvenance {
  kind: ECSGeometryProvenanceKind;
  fingerprint: string | null;
  sourceId: string | null;
  sourceType: string | null;
  sourceLabel: string | null;
  sourceFormat: string | null;
  capturedAt: string | null;
  verified: boolean | null;
  warnings: string[];
}

export interface ECSRouteProvenance {
  origin: ECSRouteOrigin;
  sourceId: string | null;
  sourceType: string | null;
  sourceLabel: string | null;
  authority: string | null;
  dataState: string | null;
  geometry: ECSGeometryProvenance;
}

export interface ECSJourneyLinkage {
  schemaVersion: typeof ECS_JOURNEY_SCHEMA_VERSION;
  phase: ECSJourneyPhase;
  identity: ECSJourneyIdentity;
  routeProvenance: ECSRouteProvenance | null;
  activeVehicleId: string | null;
  campIds: string[];
  waypointIds: string[];
  bailoutIds: string[];
  offlineReady: boolean;
  updatedAt: string;
}

export interface ECSJourneyTransitionDecision {
  accepted: boolean;
  idempotent: boolean;
  from: ECSJourneyPhase;
  to: ECSJourneyPhase;
  reason: 'allowed' | 'same_phase' | 'invalid_transition';
}

export interface ECSJourneyResumeDecision {
  allowed: boolean;
  degraded: boolean;
  phase: ECSJourneyPhase;
  reason:
    | 'ready'
    | 'missing_source'
    | 'embedded_geometry_only'
    | 'offline_package_available'
    | 'offline_package_missing'
    | 'terminal_state';
}

export type ECSGuidanceReplacementDecision =
  | { action: 'stage'; reason: 'no_active_guidance' }
  | { action: 'keep'; reason: 'same_route' }
  | { action: 'confirm'; reason: 'active_guidance_requires_confirmation' }
  | { action: 'replace'; reason: 'replacement_confirmed' };

const TRANSITIONS: Record<ECSJourneyPhase, readonly ECSJourneyPhase[]> = {
  discovered: ['previewing', 'planned', 'cancelled', 'failed'],
  previewing: ['discovered', 'planned', 'staged', 'cancelled', 'failed'],
  planned: ['previewing', 'offline_ready', 'expedition_ready', 'staged', 'cancelled', 'failed'],
  offline_ready: ['planned', 'expedition_ready', 'staged', 'cancelled', 'failed'],
  expedition_ready: ['planned', 'staged', 'active', 'cancelled', 'failed'],
  staged: ['previewing', 'active', 'cancelled', 'failed'],
  active: ['paused', 'completed', 'cancelled', 'failed'],
  paused: ['active', 'completed', 'cancelled', 'failed'],
  completed: ['archived'],
  cancelled: ['archived'],
  failed: ['discovered', 'previewing', 'planned', 'cancelled'],
  archived: [],
};

const TERMINAL_PHASES = new Set<ECSJourneyPhase>(['completed', 'cancelled', 'archived']);

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(cleanId).filter((value): value is string => !!value)));
}

function finiteCoordinate(value: unknown): { lat: number; lng: number; elevation: number | null } | null {
  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    const elevation = Number(value[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng, elevation: Number.isFinite(elevation) ? elevation : null }
      : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const lat = Number(record.lat ?? record.latitude);
  const lng = Number(record.lng ?? record.lon ?? record.longitude);
  const elevation = Number(record.ele ?? record.ele_m ?? record.elevationM ?? record.elevationFeet);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng, elevation: Number.isFinite(elevation) ? elevation : null }
    : null;
}

function flattenCoordinates(value: unknown, output: Array<{ lat: number; lng: number; elevation: number | null }>): void {
  const coordinate = finiteCoordinate(value);
  if (coordinate) {
    output.push(coordinate);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenCoordinates(entry, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const key of ['points', 'coordinates', 'geometry', 'routeGeometry', 'trailGeometry', 'segments']) {
    if (record[key] != null) flattenCoordinates(record[key], output);
  }
}

export function stableLifecycleHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function buildGeometryFingerprint(value: unknown, namespace = 'geometry'): string | null {
  const coordinates: Array<{ lat: number; lng: number; elevation: number | null }> = [];
  flattenCoordinates(value, coordinates);
  if (coordinates.length < 2) return null;
  const signature = coordinates
    .map((point) => `${point.lat.toFixed(6)},${point.lng.toFixed(6)},${point.elevation?.toFixed(1) ?? '-'}`)
    .join('|');
  return `${namespace}:${coordinates.length}:${stableLifecycleHash(signature)}`;
}

export function createEmptyJourneyIdentity(): ECSJourneyIdentity {
  return {
    schemaVersion: ECS_JOURNEY_SCHEMA_VERSION,
    discoveryId: null,
    routeAssetId: null,
    tripPlanId: null,
    offlinePackageId: null,
    expeditionId: null,
    navigationSessionId: null,
    guidanceSessionId: null,
    recordedRunId: null,
    completedOutcomeId: null,
    archiveRecordId: null,
  };
}

export function canonicalJourneyEntityId(kind: ECSJourneyEntityKind, sourceId: string): string {
  const normalized = cleanId(sourceId) ?? 'unknown';
  const prefixes: Record<ECSJourneyEntityKind, string> = {
    discovery_route: 'discovery',
    route_asset: 'route',
    trip_plan: 'trip-plan',
    offline_package: 'offline-prep',
    expedition: 'expedition',
    navigation_session: 'navigation',
    guidance_session: 'guidance',
    recorded_run: 'run',
    completed_outcome: 'expedition-trip',
    archive_record: 'archive',
  };
  const prefix = prefixes[kind];
  const separator = kind === 'trip_plan' || kind === 'offline_package' ? '-' : ':';
  return normalized.startsWith(`${prefix}:`) || normalized.startsWith(`${prefix}-`)
    ? normalized
    : `${prefix}${separator}${normalized}`;
}

export function buildCompletionKey(identity: Partial<ECSJourneyIdentity>): string | null {
  const source =
    cleanId(identity.expeditionId) ??
    cleanId(identity.guidanceSessionId) ??
    cleanId(identity.navigationSessionId) ??
    cleanId(identity.completedOutcomeId);
  return source ? canonicalJourneyEntityId('completed_outcome', source) : null;
}

export function mergeJourneyIdentity(
  current: Partial<ECSJourneyIdentity> | null | undefined,
  patch: Partial<ECSJourneyIdentity>,
): ECSJourneyIdentity {
  const empty = createEmptyJourneyIdentity();
  const merged = { ...empty, ...(current ?? {}), ...patch };
  return {
    schemaVersion: ECS_JOURNEY_SCHEMA_VERSION,
    discoveryId: cleanId(merged.discoveryId),
    routeAssetId: cleanId(merged.routeAssetId),
    tripPlanId: cleanId(merged.tripPlanId),
    offlinePackageId: cleanId(merged.offlinePackageId),
    expeditionId: cleanId(merged.expeditionId),
    navigationSessionId: cleanId(merged.navigationSessionId),
    guidanceSessionId: cleanId(merged.guidanceSessionId),
    recordedRunId: cleanId(merged.recordedRunId),
    completedOutcomeId: cleanId(merged.completedOutcomeId),
    archiveRecordId: cleanId(merged.archiveRecordId),
  };
}

export function normalizeJourneyLinkage(value: unknown): ECSJourneyLinkage | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<ECSJourneyLinkage>;
  if (!input.phase || !Object.prototype.hasOwnProperty.call(TRANSITIONS, input.phase)) return null;
  const updatedAt = cleanId(input.updatedAt) ?? new Date(0).toISOString();
  return {
    schemaVersion: ECS_JOURNEY_SCHEMA_VERSION,
    phase: input.phase,
    identity: mergeJourneyIdentity(input.identity, {}),
    routeProvenance: input.routeProvenance ?? null,
    activeVehicleId: cleanId(input.activeVehicleId),
    campIds: uniqueIds(input.campIds),
    waypointIds: uniqueIds(input.waypointIds),
    bailoutIds: uniqueIds(input.bailoutIds),
    offlineReady: input.offlineReady === true,
    updatedAt,
  };
}

export function mergeJourneyLinkage(
  current: ECSJourneyLinkage | null | undefined,
  patch: Partial<Omit<ECSJourneyLinkage, 'schemaVersion' | 'identity'>> & {
    identity?: Partial<ECSJourneyIdentity>;
  },
): ECSJourneyLinkage {
  const now = patch.updatedAt ?? new Date().toISOString();
  return {
    schemaVersion: ECS_JOURNEY_SCHEMA_VERSION,
    phase: patch.phase ?? current?.phase ?? 'discovered',
    identity: mergeJourneyIdentity(current?.identity, patch.identity ?? {}),
    routeProvenance: patch.routeProvenance === undefined
      ? current?.routeProvenance ?? null
      : patch.routeProvenance,
    activeVehicleId: patch.activeVehicleId === undefined
      ? current?.activeVehicleId ?? null
      : cleanId(patch.activeVehicleId),
    campIds: patch.campIds === undefined ? current?.campIds ?? [] : uniqueIds(patch.campIds),
    waypointIds: patch.waypointIds === undefined ? current?.waypointIds ?? [] : uniqueIds(patch.waypointIds),
    bailoutIds: patch.bailoutIds === undefined ? current?.bailoutIds ?? [] : uniqueIds(patch.bailoutIds),
    offlineReady: patch.offlineReady ?? current?.offlineReady ?? false,
    updatedAt: now,
  };
}

export function readJourneyLinkageFromMetadata(metadata: unknown): ECSJourneyLinkage | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  return normalizeJourneyLinkage(record.ecsLifecycle ?? record.lifecycle);
}

export function attachJourneyLinkageToMetadata(
  metadata: Record<string, unknown> | null | undefined,
  linkage: ECSJourneyLinkage,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    ecsLifecycle: linkage,
  };
}

export function decideJourneyTransition(
  from: ECSJourneyPhase,
  to: ECSJourneyPhase,
): ECSJourneyTransitionDecision {
  if (from === to) {
    return { accepted: true, idempotent: true, from, to, reason: 'same_phase' };
  }
  const accepted = TRANSITIONS[from].includes(to);
  return {
    accepted,
    idempotent: false,
    from,
    to,
    reason: accepted ? 'allowed' : 'invalid_transition',
  };
}

export function getAllowedJourneyTransitions(from: ECSJourneyPhase): readonly ECSJourneyPhase[] {
  return TRANSITIONS[from];
}

export function decideJourneyResume(input: {
  phase: ECSJourneyPhase;
  sourceObjectAvailable: boolean;
  embeddedGeometryAvailable: boolean;
  offline: boolean;
  offlinePackageAvailable: boolean;
}): ECSJourneyResumeDecision {
  if (TERMINAL_PHASES.has(input.phase)) {
    return { allowed: input.phase !== 'cancelled', degraded: false, phase: input.phase, reason: 'terminal_state' };
  }
  if (input.sourceObjectAvailable && (!input.offline || input.offlinePackageAvailable)) {
    return {
      allowed: true,
      degraded: false,
      phase: input.phase,
      reason: input.offline ? 'offline_package_available' : 'ready',
    };
  }
  if (input.embeddedGeometryAvailable) {
    return { allowed: true, degraded: true, phase: input.phase, reason: 'embedded_geometry_only' };
  }
  if (input.offline && !input.offlinePackageAvailable) {
    return { allowed: false, degraded: false, phase: input.phase, reason: 'offline_package_missing' };
  }
  return { allowed: false, degraded: false, phase: input.phase, reason: 'missing_source' };
}

export function decideGuidanceReplacement(input: {
  activeRouteId?: string | null;
  activeSessionId?: string | null;
  targetRouteId?: string | null;
  confirmed?: boolean;
}): ECSGuidanceReplacementDecision {
  const activeRouteId = cleanId(input.activeRouteId);
  const activeSessionId = cleanId(input.activeSessionId);
  const targetRouteId = cleanId(input.targetRouteId);
  if (!activeRouteId && !activeSessionId) return { action: 'stage', reason: 'no_active_guidance' };
  if (targetRouteId && (targetRouteId === activeRouteId || targetRouteId === activeSessionId)) {
    return { action: 'keep', reason: 'same_route' };
  }
  return input.confirmed
    ? { action: 'replace', reason: 'replacement_confirmed' }
    : { action: 'confirm', reason: 'active_guidance_requires_confirmation' };
}

export function routeOriginFromSource(source: unknown): ECSRouteOrigin {
  const normalized = String(source ?? '').trim().toLowerCase();
  if (normalized.includes('trail_pack')) return 'trail_pack';
  if (normalized.includes('ai') || normalized.includes('idea')) return 'ai_idea';
  if (normalized.includes('stitch')) return 'stitched';
  if (normalized.includes('builder') || normalized === 'custom' || normalized.includes('drawn')) return 'route_builder';
  if (['gpx', 'kml', 'kmz', 'fit', 'geojson', 'import', 'imported'].some((value) => normalized.includes(value))) {
    return 'imported';
  }
  if (normalized.includes('catalog') || normalized.includes('official')) return 'catalog';
  if (normalized.includes('recorded') || normalized === 'run') return 'recorded_run';
  if (normalized.includes('saved')) return 'saved';
  if (normalized.includes('legacy')) return 'legacy';
  return 'unknown';
}

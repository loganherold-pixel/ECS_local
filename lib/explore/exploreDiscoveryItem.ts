import type { ExpeditionOpportunity } from '../discoverEngine';
import {
  sanitizeSourceTruthDisplayText,
  sanitizeSourceTruthRef,
  type SourceTruthAuthorityKind,
  type SourceTruthConfidence,
  type SourceTruthOrigin,
  type SourceTruthRef,
} from '../sourceTruth';

export type ExploreDiscoverySourceKind =
  | 'trail_pack'
  | 'hidden_gem'
  | 'ecs_idea'
  | 'saved_built'
  | 'imported_stitched';

export type ExploreGuidanceState = 'ready' | 'preview' | 'unavailable' | 'unknown';
export type ExploreLegalAccessState = 'verified' | 'requires_review' | 'unknown' | 'conflicted';
export type ExploreCurrentConditionState = 'clear' | 'watch' | 'blocked' | 'unknown';
export type ExploreVehicleFitState = 'compatible' | 'caution' | 'incompatible' | 'unknown';
export type ExploreGeometryState = 'full' | 'preview' | 'omitted' | 'unknown';

export type ExploreDiscoveryDimensions = {
  guidance: ExploreGuidanceState;
  legalAccess: ExploreLegalAccessState;
  currentConditions: ExploreCurrentConditionState;
  vehicleFit: ExploreVehicleFitState;
};

export type ExploreDiscoverySource = {
  sourceId: string;
  sourceKind: ExploreDiscoverySourceKind;
  sourceLabel: string;
  sourcePriority: number;
  generated: boolean;
  reviewStatus: string | null;
  dataState: string | null;
  geometryState: ExploreGeometryState;
  geometryFingerprint: string | null;
  sourceTruth: SourceTruthRef;
};

export type ExploreDiscoveryConflict = {
  code:
    | 'guidance_conflict'
    | 'legal_access_conflict'
    | 'current_condition_conflict'
    | 'vehicle_fit_conflict'
    | 'geometry_provenance_conflict';
  message: string;
};

export type ExploreDiscoveryItem = {
  canonicalKey: string;
  identityAliases: string[];
  route: ExpeditionOpportunity;
  primarySource: ExploreDiscoverySource;
  sources: ExploreDiscoverySource[];
  dimensions: ExploreDiscoveryDimensions;
  conflicts: ExploreDiscoveryConflict[];
};

export type ExploreDiscoveryCandidateInput = {
  route: ExpeditionOpportunity;
  sourceKind: ExploreDiscoverySourceKind;
};

type DiscoveryGroup = {
  firstIndex: number;
  item: ExploreDiscoveryItem;
};

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function normalizedToken(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceFromScore(value: unknown): SourceTruthConfidence {
  const score = finiteNumber(value);
  if (score == null) return 'unknown';
  if (score >= 80) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function routeMetadata(route: ExpeditionOpportunity): Record<string, unknown> {
  return record(route.routeMetadata);
}

function routeSourceMetadata(route: ExpeditionOpportunity): Record<string, unknown> {
  return record(record(route).sourceMetadata);
}

function catalogVerification(metadata: Record<string, unknown>): Record<string, unknown> {
  return record(metadata.catalogVerification);
}

function currentCondition(metadata: Record<string, unknown>): Record<string, unknown> {
  const verification = catalogVerification(metadata);
  return record(verification.currentCondition ?? metadata.currentCondition);
}

function geometryState(metadata: Record<string, unknown>): ExploreGeometryState {
  const value = normalizedToken(
    metadata.routeGeometryMode ??
      metadata.geometryMode ??
      record(metadata.catalogVerification).routeGeometryMode,
  );
  if (value === 'full' || value === 'stitched') return 'full';
  if (value === 'preview-simplified' || value === 'preview') return 'preview';
  if (value === 'omitted' || value === 'missing') return 'omitted';
  return 'unknown';
}

function guidanceState(metadata: Record<string, unknown>): ExploreGuidanceState {
  const verification = catalogVerification(metadata);
  const activeGuidance = record(metadata.activeGuidance ?? verification.activeGuidance);
  const status = normalizedToken(activeGuidance.status);
  if (status === 'ready') return 'ready';
  if (status === 'preview-only' || status === 'preview') return 'preview';
  if (status === 'unavailable') return 'unavailable';
  const geometry = geometryState(metadata);
  if (geometry === 'full') return 'ready';
  if (geometry === 'preview') return 'preview';
  if (geometry === 'omitted') return 'unavailable';
  return 'unknown';
}

function legalAccessState(metadata: Record<string, unknown>): ExploreLegalAccessState {
  const verification = catalogVerification(metadata);
  const value = normalizedToken(
    metadata.legalAccessStatus ??
      metadata.accessVerificationStatus ??
      verification.legalAccessStatus ??
      verification.accessVerificationStatus,
  );
  if (value === 'verified' || value === 'official-verified' || value === 'confirmed') return 'verified';
  if (value === 'conflicted' || value === 'conflict') return 'conflicted';
  if (value === 'requires-review' || value === 'needs-review' || value === 'restricted') {
    return 'requires_review';
  }
  return 'unknown';
}

function currentConditionState(metadata: Record<string, unknown>): ExploreCurrentConditionState {
  const condition = currentCondition(metadata);
  const status = normalizedToken(condition.status ?? condition.currentlyOpenStatus);
  const activeClosures = finiteNumber(condition.activeClosureCount) ?? 0;
  if (status === 'blocked' || status === 'closed' || activeClosures > 0) return 'blocked';
  if (status === 'watch' || status === 'requires-review' || status === 'caution') return 'watch';
  if (status === 'clear' || status === 'no-known-closure') return 'clear';
  return 'unknown';
}

function vehicleFitState(route: ExpeditionOpportunity, metadata: Record<string, unknown>): ExploreVehicleFitState {
  const explicit = normalizedToken(
    metadata.vehicleFitStatus ??
      metadata.vehicleCompatibilityStatus ??
      metadata.rigCompatibilityStatus,
  );
  if (explicit === 'compatible' || explicit === 'ready') return 'compatible';
  if (explicit === 'incompatible' || explicit === 'blocked') return 'incompatible';
  if (explicit === 'caution' || explicit === 'watch' || explicit === 'partial') return 'caution';
  const score = finiteNumber(route.rigCompatibility ?? metadata.rigCompatibility);
  if (score == null) return 'unknown';
  if (score >= 70) return 'compatible';
  if (score < 40) return 'incompatible';
  return 'caution';
}

function sourceLabel(sourceKind: ExploreDiscoverySourceKind, metadata: Record<string, unknown>): string {
  const declared = sanitizeSourceTruthDisplayText(
    cleanText(metadata.trailPackSourceLabel) ??
      cleanText(metadata.routeAuthorityLabel) ??
      cleanText(metadata.sourceLabel),
    80,
  );
  if (declared) return declared;
  switch (sourceKind) {
    case 'trail_pack': return 'ECS Trail Pack';
    case 'hidden_gem': return 'ECS Hidden Gem';
    case 'ecs_idea': return 'AI-generated route idea';
    case 'saved_built': return 'Saved or built route';
    case 'imported_stitched': return 'Imported or stitched route';
  }
}

function sourceAuthority(sourceKind: ExploreDiscoverySourceKind): SourceTruthAuthorityKind {
  switch (sourceKind) {
    case 'trail_pack': return 'mixed';
    case 'hidden_gem': return 'ecs';
    case 'ecs_idea': return 'ecs';
    case 'saved_built':
    case 'imported_stitched':
      return 'user';
  }
}

function sourceOrigin(sourceKind: ExploreDiscoverySourceKind, metadata: Record<string, unknown>): SourceTruthOrigin {
  if (sourceKind === 'ecs_idea' || sourceKind === 'hidden_gem') return 'inferred';
  if (sourceKind === 'saved_built' || sourceKind === 'imported_stitched') return 'manual';
  const dataState = normalizedToken(metadata.trailPackDataState ?? metadata.dataState);
  if (dataState === 'fixture' || dataState === 'simulated' || dataState === 'mocked') return 'simulated';
  if (dataState === 'local-review' || dataState === 'manual') return 'manual';
  if (dataState === 'cached') return 'cached';
  return dataState === 'live' ? 'live' : 'cached';
}

function sourcePriority(sourceKind: ExploreDiscoverySourceKind, metadata: Record<string, unknown>): number {
  if (sourceKind === 'ecs_idea') return 10;
  if (sourceKind === 'hidden_gem') return 55;
  if (sourceKind === 'saved_built') return 75;
  if (sourceKind === 'imported_stitched') return 70;

  const source = normalizedToken(
    metadata.trailPackSource ??
      metadata.routeCatalogSourceType ??
      metadata.sourceType ??
      metadata.source,
  );
  if (source === 'official' || source === 'ecs-validated') return 100;
  if (source === 'partner-source') return 90;
  if (source === 'community-reviewed' || source === 'community') return 82;
  if (source === 'imported-gpx' || source === 'imported-kml' || source === 'imported') return 70;
  if (source === 'ecs-submitted') return 35;
  if (source === 'needs-review') return 20;
  return 80;
}

function existingSourceTruth(metadata: Record<string, unknown>): SourceTruthRef | null {
  const candidate = record(metadata.sourceTruth);
  if (!cleanText(candidate.id) || !cleanText(candidate.origin) || !cleanText(candidate.confidence)) return null;
  return sanitizeSourceTruthRef(candidate as unknown as SourceTruthRef);
}

function buildSourceTruth(
  route: ExpeditionOpportunity,
  sourceKind: ExploreDiscoverySourceKind,
  metadata: Record<string, unknown>,
): SourceTruthRef {
  const declared = existingSourceTruth(metadata);
  if (declared) return declared;
  const verification = catalogVerification(metadata);
  const routeRecord = record(route);
  const generated = sourceKind === 'ecs_idea';
  return sanitizeSourceTruthRef({
    id: `${sourceKind}:${String(route.id)}`,
    origin: sourceOrigin(sourceKind, metadata),
    policyKey: 'route_legal_access_evidence',
    authority: sourceLabel(sourceKind, metadata),
    authorityKind: sourceAuthority(sourceKind),
    provider: null,
    observedAt:
      cleanText(metadata.lastVerifiedAt) ??
      cleanText(verification.lastEvaluatedAt) ??
      cleanText(routeRecord.generatedAt) ??
      cleanText(routeRecord.updatedAt) ??
      null,
    fetchedAt: null,
    expiresAt: null,
    confidence: generated
      ? 'low'
      : confidenceFromScore(
          metadata.confidenceScore ??
            verification.confidenceScore ??
            route.matchScore,
        ),
    coverage: 'unknown',
    availability: 'usable',
    conflictState: 'none',
    conflict: false,
    warningCodes: generated ? ['generated_route_idea_not_verified_access'] : [],
  });
}

function identityAliases(route: ExpeditionOpportunity): string[] {
  const metadata = routeMetadata(route);
  const sourceMetadata = routeSourceMetadata(route);
  const aliases = new Set<string>();
  const add = (prefix: string, value: unknown) => {
    const token = normalizedToken(value);
    if (token) aliases.add(`${prefix}:${token}`);
  };

  add('identity', metadata.identityKey ?? sourceMetadata.identityKey);
  add('fingerprint', metadata.sourceFingerprint ?? metadata.geometryFingerprint);
  add('catalog', metadata.routeCatalogId ?? metadata.catalogRouteId ?? metadata.trailPackId);
  add('external', metadata.externalSourceId);

  const strippedId = String(route.id ?? '')
    .replace(/^(trail-pack|favorite|route|run):/i, '')
    .trim();
  add('source-id', strippedId);

  const name = normalizedToken(route.name);
  const latitude = finiteNumber(route.startLat);
  const longitude = finiteNumber(route.startLng);
  const distanceMiles = finiteNumber(route.distanceMiles);
  if (name && latitude != null && longitude != null && distanceMiles != null) {
    aliases.add(
      `geo:${name}:${latitude.toFixed(3)}:${longitude.toFixed(3)}:${distanceMiles.toFixed(1)}`,
    );
  }

  if (aliases.size === 0) aliases.add(`source-id:${normalizedToken(route.id) ?? 'unknown-route'}`);
  return Array.from(aliases).sort();
}

function canonicalKey(aliases: string[]): string {
  const prefixOrder = ['identity:', 'fingerprint:', 'catalog:', 'external:', 'source-id:', 'geo:'];
  for (const prefix of prefixOrder) {
    const match = aliases.find((alias) => alias.startsWith(prefix));
    if (match) return match;
  }
  return aliases[0] ?? 'source-id:unknown-route';
}

function geometryFingerprint(metadata: Record<string, unknown>): string | null {
  return cleanText(metadata.sourceFingerprint ?? metadata.geometryFingerprint);
}

function sourceDescriptor(input: ExploreDiscoveryCandidateInput): ExploreDiscoverySource {
  const metadata = routeMetadata(input.route);
  const routeRecord = record(input.route);
  return {
    sourceId: String(input.route.id),
    sourceKind: input.sourceKind,
    sourceLabel: sourceLabel(input.sourceKind, metadata),
    sourcePriority: sourcePriority(input.sourceKind, metadata),
    generated: input.sourceKind === 'ecs_idea' || routeRecord.isAIGenerated === true,
    reviewStatus: cleanText(metadata.reviewStatus),
    dataState: cleanText(metadata.trailPackDataState ?? metadata.dataState),
    geometryState: geometryState(metadata),
    geometryFingerprint: geometryFingerprint(metadata),
    sourceTruth: buildSourceTruth(input.route, input.sourceKind, metadata),
  };
}

export function normalizeExploreDiscoveryItem(
  input: ExploreDiscoveryCandidateInput,
): ExploreDiscoveryItem {
  const metadata = routeMetadata(input.route);
  const aliases = identityAliases(input.route);
  const source = sourceDescriptor(input);
  return {
    canonicalKey: canonicalKey(aliases),
    identityAliases: aliases,
    route: input.route,
    primarySource: source,
    sources: [source],
    dimensions: {
      guidance: guidanceState(metadata),
      legalAccess: legalAccessState(metadata),
      currentConditions: currentConditionState(metadata),
      vehicleFit: vehicleFitState(input.route, metadata),
    },
    conflicts: [],
  };
}

function sourceIdentity(source: ExploreDiscoverySource): string {
  return `${source.sourceKind}:${source.sourceId}`;
}

function mergeSources(
  left: ExploreDiscoverySource[],
  right: ExploreDiscoverySource[],
): ExploreDiscoverySource[] {
  const byIdentity = new Map<string, ExploreDiscoverySource>();
  [...left, ...right].forEach((source) => {
    const key = sourceIdentity(source);
    const current = byIdentity.get(key);
    if (!current || source.sourcePriority > current.sourcePriority) byIdentity.set(key, source);
  });
  return Array.from(byIdentity.values()).sort((a, b) => {
    if (a.sourcePriority !== b.sourcePriority) return b.sourcePriority - a.sourcePriority;
    return sourceIdentity(a).localeCompare(sourceIdentity(b));
  });
}

function mergeDimension<T extends string>(
  left: T,
  right: T,
  unknown: T,
): { value: T; conflict: boolean } {
  if (left === unknown) return { value: right, conflict: false };
  if (right === unknown) return { value: left, conflict: false };
  if (left === right) return { value: left, conflict: false };
  return { value: left, conflict: true };
}

function routePayloadScore(item: ExploreDiscoveryItem): number {
  const guidanceScore = item.dimensions.guidance === 'ready'
    ? 1_000
    : item.dimensions.guidance === 'preview'
      ? 500
      : 0;
  const geometryScore = item.primarySource.geometryState === 'full'
    ? 300
    : item.primarySource.geometryState === 'preview'
      ? 100
      : 0;
  return guidanceScore + geometryScore + item.primarySource.sourcePriority;
}

function mergeDiscoveryItems(left: ExploreDiscoveryItem, right: ExploreDiscoveryItem): ExploreDiscoveryItem {
  const sources = mergeSources(left.sources, right.sources);
  const primarySource = sources[0];
  const aliases = Array.from(new Set([...left.identityAliases, ...right.identityAliases])).sort();
  const route = routePayloadScore(right) > routePayloadScore(left) ? right.route : left.route;
  const guidance = mergeDimension(left.dimensions.guidance, right.dimensions.guidance, 'unknown');
  const legalAccess = mergeDimension(left.dimensions.legalAccess, right.dimensions.legalAccess, 'unknown');
  const currentConditions = mergeDimension(
    left.dimensions.currentConditions,
    right.dimensions.currentConditions,
    'unknown',
  );
  const vehicleFit = mergeDimension(left.dimensions.vehicleFit, right.dimensions.vehicleFit, 'unknown');
  const conflicts = new Map<string, ExploreDiscoveryConflict>();
  [...left.conflicts, ...right.conflicts].forEach((conflict) => conflicts.set(conflict.code, conflict));
  if (guidance.conflict) {
    conflicts.set('guidance_conflict', {
      code: 'guidance_conflict',
      message: 'Sources disagree about active-guidance readiness.',
    });
  }
  if (legalAccess.conflict) {
    conflicts.set('legal_access_conflict', {
      code: 'legal_access_conflict',
      message: 'Sources disagree about legal or access verification.',
    });
  }
  if (currentConditions.conflict) {
    conflicts.set('current_condition_conflict', {
      code: 'current_condition_conflict',
      message: 'Sources report different current-condition states.',
    });
  }
  if (vehicleFit.conflict) {
    conflicts.set('vehicle_fit_conflict', {
      code: 'vehicle_fit_conflict',
      message: 'Sources report different active-vehicle fit states.',
    });
  }
  const fingerprints = new Set(
    sources.map((source) => source.geometryFingerprint).filter((value): value is string => !!value),
  );
  if (fingerprints.size > 1) {
    conflicts.set('geometry_provenance_conflict', {
      code: 'geometry_provenance_conflict',
      message: 'Sources reference different route geometry revisions.',
    });
  }

  return {
    canonicalKey: canonicalKey(aliases),
    identityAliases: aliases,
    route,
    primarySource,
    sources,
    dimensions: {
      guidance: guidance.value,
      legalAccess: legalAccess.conflict ? 'conflicted' : legalAccess.value,
      currentConditions: currentConditions.conflict ? 'watch' : currentConditions.value,
      vehicleFit: vehicleFit.conflict ? 'caution' : vehicleFit.value,
    },
    conflicts: Array.from(conflicts.values()),
  };
}

export function normalizeExploreDiscoveryItems(
  inputs: ExploreDiscoveryCandidateInput[],
): ExploreDiscoveryItem[] {
  const groups = new Map<number, DiscoveryGroup>();
  const aliasToGroup = new Map<string, number>();
  let nextGroupId = 1;

  inputs.forEach((input, index) => {
    const item = normalizeExploreDiscoveryItem(input);
    const matchingGroupIds = Array.from(new Set(
      item.identityAliases
        .map((alias) => aliasToGroup.get(alias))
        .filter((groupId): groupId is number => groupId != null),
    ));

    if (matchingGroupIds.length === 0) {
      const groupId = nextGroupId++;
      groups.set(groupId, { firstIndex: index, item });
      item.identityAliases.forEach((alias) => aliasToGroup.set(alias, groupId));
      return;
    }

    const targetGroupId = Math.min(...matchingGroupIds);
    const target = groups.get(targetGroupId);
    if (!target) return;
    let merged = mergeDiscoveryItems(target.item, item);
    let firstIndex = Math.min(target.firstIndex, index);

    matchingGroupIds.forEach((groupId) => {
      if (groupId === targetGroupId) return;
      const other = groups.get(groupId);
      if (!other) return;
      merged = mergeDiscoveryItems(merged, other.item);
      firstIndex = Math.min(firstIndex, other.firstIndex);
      groups.delete(groupId);
    });

    groups.set(targetGroupId, { firstIndex, item: merged });
    merged.identityAliases.forEach((alias) => aliasToGroup.set(alias, targetGroupId));
  });

  return Array.from(groups.values())
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((group) => group.item);
}

export function routeWithExploreDiscoveryProvenance(
  item: ExploreDiscoveryItem,
): ExpeditionOpportunity {
  return {
    ...item.route,
    routeMetadata: {
      ...(item.route.routeMetadata ?? {}),
      identityKey: item.canonicalKey,
      discoveryCanonicalKey: item.canonicalKey,
      discoverySourceKind: item.primarySource.sourceKind,
      discoverySourceLabel: item.primarySource.sourceLabel,
      discoveryGenerated: item.primarySource.generated,
      discoverySources: item.sources.map((source) => ({
        sourceId: source.sourceId,
        sourceKind: source.sourceKind,
        sourceLabel: source.sourceLabel,
        generated: source.generated,
        reviewStatus: source.reviewStatus,
        dataState: source.dataState,
        geometryState: source.geometryState,
        sourceTruth: source.sourceTruth,
      })),
      discoveryDimensions: item.dimensions,
      discoveryConflictCodes: item.conflicts.map((conflict) => conflict.code),
    },
  };
}

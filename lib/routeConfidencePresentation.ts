import type { ECSConfidenceResult } from './ai/confidenceTypes';
import type { ECSTrustMetadata } from './ai/trustTypes';
import type { ECSVehicularState } from './fleet/activeVehicleState';

type VehicleEcsIntegrationModule = {
  getActiveVehicleSnapshotForEcs: () => ECSVehicularState;
  scoreVehicleSuitabilityForEcs: (input: {
    activeVehicleState?: ECSVehicularState | null;
    accessDemand?: string | null;
  }) => {
    level: 'strong' | 'workable' | 'caution' | 'limited' | 'unknown';
    label: string;
    concerns: string[];
  };
};

declare const require: (path: string) => VehicleEcsIntegrationModule;

let vehicleEcsIntegration: VehicleEcsIntegrationModule | null = null;

function getVehicleEcsIntegration(): VehicleEcsIntegrationModule {
  if (!vehicleEcsIntegration) {
    vehicleEcsIntegration = require('./vehicleEcsIntegration');
  }
  return vehicleEcsIntegration;
}

export type RouteConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface RouteConfidenceResult {
  level: RouteConfidenceLevel;
  reasons: string[];
  concerns?: string[];
  sourceMix?: string[];
  freshness?: string;
  conflicts?: string[];
}

export interface RouteConfidenceInput {
  routeSource?: string | null;
  routeLabel?: string | null;
  isCustomRoute?: boolean | null;
  isImportedRoute?: boolean | null;
  isGeneratedRoute?: boolean | null;
  isUserSupported?: boolean | null;
  isCurated?: boolean | null;
  hasCompleteGeometry?: boolean | null;
  hasMissingSegments?: boolean | null;
  hasStaleRouteIntel?: boolean | null;
  cachedOnlyContext?: boolean | null;
  freshness?: string | null;
  accessStatus?: string | null;
  conflictingSignals?: string[] | null;
  recommendationConfidence?: ECSConfidenceResult | null;
  trust?: ECSTrustMetadata | null;
  vehicleState?: ECSVehicularState | null;
  vehicleAware?: boolean | null;
  legacyGeneratedConfidence?: 'high' | 'good' | 'explore' | string | null;
}

type ExploreRouteConfidenceInput = {
  routeLabel?: string | null;
  isAIGenerated?: boolean | null;
  aiConfidence?: 'high' | 'good' | 'explore' | string | null;
  recommendationConfidence?: ECSConfidenceResult | null;
  trust?: ECSTrustMetadata | null;
  startLat?: number | null;
  startLng?: number | null;
  distanceMiles?: number | null;
  vehicleAware?: boolean | null;
};

const LEVEL_RANK: Record<RouteConfidenceLevel, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function uniqueLimited(values: Array<string | null | undefined>, max = 3): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    output.push(clean);
    if (output.length >= max) break;
  }
  return output;
}

function minLevel(current: RouteConfidenceLevel, cap: RouteConfidenceLevel): RouteConfidenceLevel {
  return LEVEL_RANK[current] <= LEVEL_RANK[cap] ? current : cap;
}

function levelFromLegacyGenerated(confidence?: string | null): RouteConfidenceLevel | null {
  if (confidence === 'high') return 'medium';
  if (confidence === 'good') return 'medium';
  if (confidence === 'explore') return 'low';
  return null;
}

function normalizeSourceLabel(input: RouteConfidenceInput): string | null {
  const source = (input.routeSource ?? input.routeLabel ?? '').trim().toLowerCase();
  if (input.isCustomRoute || source.includes('custom') || source.includes('drawn')) {
    return 'Custom route';
  }
  if (input.isImportedRoute || source.includes('import')) {
    return 'Imported route';
  }
  if (input.isCurated || source.includes('known') || source.includes('local favorite') || source.includes('curated')) {
    return 'ECS-curated';
  }
  if (input.isGeneratedRoute || source.includes('ecs suggested') || source.includes('ecs-inferred') || source.includes('generated')) {
    return 'ECS-Inferred';
  }
  if (input.isUserSupported || source.includes('user')) {
    return 'User-supported';
  }
  return null;
}

function hasExplicitSource(input: RouteConfidenceInput): boolean {
  return !!normalizeSourceLabel(input);
}

function hasExplicitFreshness(input: RouteConfidenceInput): boolean {
  return !!input.freshness || !!input.trust?.freshnessLabel || !!input.trust?.asOfLabel;
}

function routeAccessDemand(input: RouteConfidenceInput): string | null {
  const access = String(input.accessStatus ?? '').toLowerCase();
  if (access.includes('technical')) return 'technical';
  if (access.includes('high') || access.includes('clearance')) return 'high_clearance';
  if (access.includes('moderate')) return 'moderate';
  if (access.includes('easy')) return 'easy';
  return null;
}

export function deriveRouteConfidence(input: RouteConfidenceInput): RouteConfidenceResult {
  const sourceLabel = normalizeSourceLabel(input);
  const reasons: string[] = [];
  const concerns: string[] = [];
  const sourceMix: string[] = [];
  const conflicts = uniqueLimited(input.conflictingSignals ?? []);
  const hasConflict = conflicts.length > 0;
  const isCustom = sourceLabel === 'Custom route';
  const isImported = sourceLabel === 'Imported route';
  const isCurated = sourceLabel === 'ECS-curated';
  const isGenerated = sourceLabel === 'ECS-Inferred';

  let level: RouteConfidenceLevel = 'unknown';

  if (!hasExplicitSource(input) && !hasExplicitFreshness(input) && input.hasCompleteGeometry !== true && !input.recommendationConfidence) {
    level = 'unknown';
  }

  if (isCurated) {
    reasons.push('ECS-curated route');
    sourceMix.push('Curated');
    if (!input.hasStaleRouteIntel && !input.hasMissingSegments && !hasConflict) {
      level = input.hasCompleteGeometry === true && input.trust?.freshness === 'fresh' ? 'high' : 'medium';
    }
  }

  if (isGenerated) {
    reasons.push('ECS-Inferred route');
    sourceMix.push('ECS-Inferred');
    level = minLevel(levelFromLegacyGenerated(input.legacyGeneratedConfidence) ?? (input.hasCompleteGeometry === true ? 'medium' : 'low'), 'medium');
  }

  if (isCustom) {
    reasons.push('Custom route');
    sourceMix.push('User route');
    concerns.push('Custom route - limited ECS field support');
    concerns.push('Access and recent passability may be unknown');
    level = 'low';
  } else if (isImported) {
    reasons.push('Imported route');
    sourceMix.push('Imported');
    concerns.push('Imported route - ECS support may be limited');
    level = minLevel(level === 'unknown' ? 'low' : level, 'medium');
  }

  if (input.isUserSupported && !isCustom) {
    reasons.push('User-supported evidence');
    sourceMix.push('User-supported');
    if (level === 'unknown') level = 'medium';
  }

  if (input.hasCompleteGeometry === true) {
    reasons.push('Route geometry present');
  } else if (input.hasCompleteGeometry === false) {
    concerns.push('Route geometry incomplete');
    level = minLevel(level === 'unknown' ? 'low' : level, 'low');
  }

  if (input.hasStaleRouteIntel || input.trust?.freshness === 'stale') {
    concerns.push('Route intelligence is aging');
    level = minLevel(level === 'unknown' ? 'medium' : level, 'medium');
  } else if (input.trust?.freshness === 'aging') {
    concerns.push('Supporting evidence is aging');
    level = minLevel(level === 'unknown' ? 'medium' : level, 'medium');
  }

  if (input.hasMissingSegments) {
    concerns.push('Some route segments lack supporting evidence');
    level = minLevel(level === 'unknown' ? 'low' : level, 'low');
  }

  if (input.cachedOnlyContext) {
    concerns.push('Cached-only route context');
    level = minLevel(level === 'unknown' ? 'medium' : level, 'medium');
  }

  const access = (input.accessStatus ?? '').trim().toLowerCase();
  if (access.includes('conflict') || access.includes('mixed')) {
    concerns.push('Conflicting access/status signals');
    level = minLevel(level === 'unknown' ? 'medium' : level, 'medium');
  } else if (access.includes('restricted') || access.includes('unknown') || access.includes('limited')) {
    concerns.push('Access signal needs review');
    level = minLevel(level === 'unknown' ? 'low' : level, 'low');
  }

  if (hasConflict) {
    concerns.push('Conflicting access/status signals');
    level = minLevel(level === 'unknown' ? 'medium' : level, 'medium');
  }

  if (input.vehicleAware !== false) {
    const vehicleIntegration = getVehicleEcsIntegration();
    const vehicleState = input.vehicleState ?? vehicleIntegration.getActiveVehicleSnapshotForEcs();
    const vehicleFit = vehicleIntegration.scoreVehicleSuitabilityForEcs({
      activeVehicleState: vehicleState,
      accessDemand: routeAccessDemand(input),
    });
    if (vehicleFit.level === 'unknown') {
      concerns.push('Vehicle fit unknown');
      level = minLevel(level === 'unknown' ? 'medium' : level, 'medium');
    } else if (vehicleFit.level === 'limited') {
      concerns.push(vehicleFit.concerns[0] ?? 'Vehicle fit limited');
      level = minLevel(level === 'unknown' ? 'low' : level, 'low');
    } else if (vehicleFit.level === 'caution') {
      concerns.push(vehicleFit.concerns[0] ?? 'Vehicle fit needs verification');
      level = minLevel(level === 'unknown' ? 'medium' : level, 'medium');
    } else {
      reasons.push(vehicleFit.label);
      sourceMix.push('Fleet');
    }
  }

  const freshness = input.trust?.asOfLabel
    ? `${input.trust.freshnessLabel} - ${input.trust.asOfLabel}`
    : input.trust?.freshnessLabel ?? undefined;

  if (!reasons.length) {
    if (level === 'unknown') {
      reasons.push('Not enough route evidence');
    } else {
      reasons.push('Limited route evidence');
    }
  }

  return {
    level,
    reasons: uniqueLimited(reasons),
    concerns: uniqueLimited(concerns),
    sourceMix: uniqueLimited(sourceMix),
    freshness,
    conflicts: conflicts.length ? conflicts : undefined,
  };
}

export function deriveExploreRouteConfidence(route: ExploreRouteConfidenceInput | null | undefined): RouteConfidenceResult {
  if (!route) return deriveRouteConfidence({});
  const hasCompleteGeometry =
    Number.isFinite(route.startLat) &&
    Number.isFinite(route.startLng) &&
    Number.isFinite(route.distanceMiles) &&
    Number(route.distanceMiles) > 0;

  return deriveRouteConfidence({
    routeLabel: route.routeLabel ?? null,
    isGeneratedRoute: !!route.isAIGenerated,
    hasCompleteGeometry,
    recommendationConfidence: route.recommendationConfidence ?? null,
    trust: route.trust ?? null,
    legacyGeneratedConfidence: route.aiConfidence ?? null,
    vehicleAware: route.vehicleAware,
  });
}

export function getRouteConfidenceLabel(level: RouteConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return 'Unknown';
  }
}

export function getRouteConfidenceColor(level: RouteConfidenceLevel): string {
  switch (level) {
    case 'high':
      return '#66BB6A';
    case 'medium':
      return '#D4A017';
    case 'low':
      return '#E67E22';
    default:
      return '#8B949E';
  }
}

export function getRouteConfidenceIcon(level: RouteConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'checkmark-circle-outline';
    case 'medium':
      return 'git-compare-outline';
    case 'low':
      return 'warning-outline';
    default:
      return 'help-circle-outline';
  }
}

function normalizeChipLabel(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('aging') || lower.includes('stale')) return 'Aging intel';
  if (lower.includes('custom route - limited ecs field support')) return 'Sparse ECS intel';
  if (lower.includes('access and recent passability')) return 'Access unknown';
  if (lower.includes('conflicting access') || lower.includes('conflicting')) return 'Conflicting signals';
  if (lower.includes('missing') || lower.includes('not enough')) return 'Limited data';
  if (lower.includes('geometry incomplete')) return 'Incomplete geometry';
  if (lower.includes('geometry present')) return 'Route geometry';
  if (lower.includes('cached-only')) return 'Cached context';
  if (lower.includes('ecs-curated')) return 'ECS-curated';
  if (lower.includes('ecs-inferred')) return 'ECS-Inferred';
  if (lower.includes('custom route')) return 'Custom route';
  if (lower.includes('imported route')) return 'Imported route';
  if (lower.includes('user-supported')) return 'User-supported';
  return value;
}

export function getRouteConfidenceReasonChips(
  result: RouteConfidenceResult | null | undefined,
  max = 2,
): string[] {
  if (!result) return [];
  const candidates =
    result.level === 'high'
      ? [
          result.freshness?.toLowerCase().includes('fresh') ? 'Recent support' : null,
          ...result.reasons,
          ...(result.sourceMix ?? []),
        ]
      : [
          ...(result.concerns ?? []),
          ...result.reasons,
          ...(result.conflicts ?? []),
          ...(result.sourceMix ?? []),
        ];

  return uniqueLimited(candidates.map((candidate) => (
    typeof candidate === 'string' ? normalizeChipLabel(candidate) : null
  )), max);
}

export function formatRouteConfidenceLine(result: RouteConfidenceResult | null | undefined): string | null {
  if (!result) return null;
  const reason = result.reasons[0] ?? result.concerns?.[0] ?? 'Not enough route evidence';
  return `Route Confidence: ${getRouteConfidenceLabel(result.level)} - ${reason}`;
}

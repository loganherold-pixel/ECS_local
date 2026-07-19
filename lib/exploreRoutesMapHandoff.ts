import { createPersistedKeyValueCache } from './keyValuePersistence';
import type { DistanceRadius } from './discoverEngine';
import type {
  ExploreRouteOverlayCategory,
  ExploreRouteOverlaySegment,
} from './navigateExploreRoutesOverlay';
import {
  capUniqueRankedRoutes,
  ECS_ROUTE_SEARCH_RESULT_LIMIT,
} from './explore/routeSearchResultPolicy';

const STORAGE_KEY = 'ecs_explore_routes_map_handoff_v1';
const exploreRoutesMapHandoffCache = createPersistedKeyValueCache('ecs_explore_routes_map_handoff');

export type ExploreRoutesMapHandoff = {
  id: string;
  source: 'explore';
  target: 'navigate';
  label: string;
  radiusMiles: DistanceRadius;
  refinementLabel: string | null;
  categories: ExploreRouteOverlayCategory[];
  segments: ExploreRouteOverlaySegment[];
  candidateCount: number;
  skippedMissingGeometryCount: number;
  cappedCount: number;
  createdAt: string;
};

function finiteNonNegativeInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function handoffSegmentRouteIdentity(segment: ExploreRouteOverlaySegment): string {
  const route = segment?.route as unknown as Record<string, unknown> | null;
  const routeMetadata = route?.routeMetadata && typeof route.routeMetadata === 'object'
    ? route.routeMetadata as Record<string, unknown>
    : null;
  const sourceMetadata = route?.sourceMetadata && typeof route.sourceMetadata === 'object'
    ? route.sourceMetadata as Record<string, unknown>
    : null;
  return String(
    routeMetadata?.identityKey ??
    sourceMetadata?.identityKey ??
    route?.id ??
    segment?.id ??
    '',
  ).trim().toLowerCase();
}

function normalizeHandoffSegments(value: unknown): {
  segments: ExploreRouteOverlaySegment[];
  uniqueRouteCount: number;
} {
  const rawSegments = Array.isArray(value)
    ? value.filter(
      (segment): segment is ExploreRouteOverlaySegment =>
        Boolean(segment) && typeof segment === 'object',
    )
    : [];
  const identities = new Set<string>();
  rawSegments.forEach((segment) => {
    const identity = handoffSegmentRouteIdentity(segment);
    if (identity) identities.add(identity);
  });
  return {
    segments: capUniqueRankedRoutes(rawSegments, handoffSegmentRouteIdentity),
    uniqueRouteCount: identities.size,
  };
}

function normalizeHandoff(value: unknown): ExploreRoutesMapHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ExploreRoutesMapHandoff>;
  if (candidate.source !== 'explore' || candidate.target !== 'navigate') return null;
  if (!Array.isArray(candidate.segments)) return null;
  const normalizedSegments = normalizeHandoffSegments(candidate.segments);
  const skippedMissingGeometryCount = finiteNonNegativeInteger(
    candidate.skippedMissingGeometryCount,
  );
  const cappedCount = Math.max(
    finiteNonNegativeInteger(candidate.cappedCount),
    Math.max(0, normalizedSegments.uniqueRouteCount - ECS_ROUTE_SEARCH_RESULT_LIMIT),
  );

  return {
    id: String(candidate.id || `explore-routes:${Date.now()}`),
    source: 'explore',
    target: 'navigate',
    label: String(candidate.label || 'Explorer filtered routes'),
    radiusMiles: Number(candidate.radiusMiles || 100) as DistanceRadius,
    refinementLabel:
      typeof candidate.refinementLabel === 'string' && candidate.refinementLabel.trim()
        ? candidate.refinementLabel.trim()
        : null,
    categories: Array.isArray(candidate.categories) ? candidate.categories : [],
    segments: normalizedSegments.segments,
    candidateCount: Math.max(
      finiteNonNegativeInteger(candidate.candidateCount),
      normalizedSegments.segments.length + skippedMissingGeometryCount + cappedCount,
    ),
    skippedMissingGeometryCount,
    cappedCount,
    createdAt: String(candidate.createdAt || new Date().toISOString()),
  };
}

async function writeStorage(value: ExploreRoutesMapHandoff | null): Promise<void> {
  await exploreRoutesMapHandoffCache.waitForHydration();
  if (!value) {
    exploreRoutesMapHandoffCache.delete(STORAGE_KEY);
  } else {
    exploreRoutesMapHandoffCache.set(STORAGE_KEY, JSON.stringify(value));
  }
  await exploreRoutesMapHandoffCache.flush();
}

export async function saveExploreRoutesMapHandoff(
  payload: Omit<ExploreRoutesMapHandoff, 'id' | 'source' | 'target' | 'createdAt'>,
): Promise<ExploreRoutesMapHandoff> {
  const next = normalizeHandoff({
    ...payload,
    id: `explore-routes:${Date.now()}`,
    source: 'explore',
    target: 'navigate',
    createdAt: new Date().toISOString(),
  });
  if (!next) {
    throw new Error('Explore route map handoff could not be normalized.');
  }
  await writeStorage(next);
  return next;
}

export async function loadExploreRoutesMapHandoff(): Promise<ExploreRoutesMapHandoff | null> {
  await exploreRoutesMapHandoffCache.waitForHydration();
  const raw = exploreRoutesMapHandoffCache.get(STORAGE_KEY);
  if (!raw) return null;

  try {
    return normalizeHandoff(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function clearExploreRoutesMapHandoff(): Promise<void> {
  await writeStorage(null);
}

export async function consumeExploreRoutesMapHandoff(): Promise<ExploreRoutesMapHandoff | null> {
  const payload = await loadExploreRoutesMapHandoff();
  if (payload) {
    await clearExploreRoutesMapHandoff();
  }
  return payload;
}

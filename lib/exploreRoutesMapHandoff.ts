import { createPersistedKeyValueCache } from './keyValuePersistence';
import type { DistanceRadius } from './discoverEngine';
import type {
  ExploreRouteOverlayCategory,
  ExploreRouteOverlaySegment,
} from './navigateExploreRoutesOverlay';

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

function normalizeHandoff(value: unknown): ExploreRoutesMapHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ExploreRoutesMapHandoff>;
  if (candidate.source !== 'explore' || candidate.target !== 'navigate') return null;
  if (!Array.isArray(candidate.segments)) return null;

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
    segments: candidate.segments,
    candidateCount: Number.isFinite(Number(candidate.candidateCount))
      ? Number(candidate.candidateCount)
      : candidate.segments.length,
    skippedMissingGeometryCount: Number.isFinite(Number(candidate.skippedMissingGeometryCount))
      ? Number(candidate.skippedMissingGeometryCount)
      : 0,
    cappedCount: Number.isFinite(Number(candidate.cappedCount))
      ? Number(candidate.cappedCount)
      : 0,
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
  const next: ExploreRoutesMapHandoff = {
    ...payload,
    id: `explore-routes:${Date.now()}`,
    source: 'explore',
    target: 'navigate',
    createdAt: new Date().toISOString(),
  };
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

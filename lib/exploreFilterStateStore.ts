import {
  DEFAULT_DISTANCE_RADIUS,
  DISTANCE_RADIUS_OPTIONS,
  type DistanceRadius,
} from './discoverEngine';
import type { ExploreRefinementFilter } from './explore/exploreRefinementFilter';
import { createPersistedKeyValueCache } from './keyValuePersistence';

const STORAGE_KEY = 'ecs_explore_filter_state_v1';
const exploreFilterStateCache = createPersistedKeyValueCache('ecs_explore_filter_state');

export type ExplorerCategoryPanelKey =
  | 'hiddenGems'
  | 'popularTrails'
  | 'trailPacks'
  | 'ecsRouteIdeas'
  | 'favorites';

export type ExploreFilterResultSetSummary = {
  displayedRouteCount: number;
  candidateCount: number;
  skippedMissingGeometryCount: number;
  cappedCount: number;
};

export type ExploreFilterStateSnapshot = {
  radiusMiles: DistanceRadius | null;
  refinement: ExploreRefinementFilter | null;
  activeCategoryPanel: ExplorerCategoryPanelKey | null;
  resultSetSummary: ExploreFilterResultSetSummary | null;
  updatedAt: string | null;
};

const DEFAULT_SNAPSHOT: ExploreFilterStateSnapshot = {
  radiusMiles: DEFAULT_DISTANCE_RADIUS,
  refinement: null,
  activeCategoryPanel: null,
  resultSetSummary: null,
  updatedAt: null,
};

const VALID_REFINEMENTS = new Set<ExploreRefinementFilter>([
  'remoteness',
  'dayTrip',
  'weekendTrip',
  'expedition',
]);

const VALID_CATEGORY_PANELS = new Set<ExplorerCategoryPanelKey>([
  'hiddenGems',
  'popularTrails',
  'trailPacks',
  'ecsRouteIdeas',
  'favorites',
]);

let snapshot: ExploreFilterStateSnapshot = { ...DEFAULT_SNAPSHOT };

function normalizeRadius(value: unknown): DistanceRadius | null {
  if (value == null) return null;
  const parsed = Number(value);
  return (DISTANCE_RADIUS_OPTIONS as readonly number[]).includes(parsed)
    ? (parsed as DistanceRadius)
    : DEFAULT_DISTANCE_RADIUS;
}

function normalizeNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeResultSetSummary(value: unknown): ExploreFilterResultSetSummary | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ExploreFilterResultSetSummary>;
  return {
    displayedRouteCount: normalizeNonNegativeNumber(candidate.displayedRouteCount),
    candidateCount: normalizeNonNegativeNumber(candidate.candidateCount),
    skippedMissingGeometryCount: normalizeNonNegativeNumber(candidate.skippedMissingGeometryCount),
    cappedCount: normalizeNonNegativeNumber(candidate.cappedCount),
  };
}

function normalizeSnapshot(value: unknown): ExploreFilterStateSnapshot {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SNAPSHOT };
  const candidate = value as Partial<ExploreFilterStateSnapshot>;
  const refinement =
    typeof candidate.refinement === 'string' && VALID_REFINEMENTS.has(candidate.refinement)
      ? candidate.refinement
      : null;
  const activeCategoryPanel =
    typeof candidate.activeCategoryPanel === 'string' && VALID_CATEGORY_PANELS.has(candidate.activeCategoryPanel)
      ? candidate.activeCategoryPanel
      : null;

  return {
    radiusMiles: normalizeRadius(candidate.radiusMiles),
    refinement,
    activeCategoryPanel,
    resultSetSummary: normalizeResultSetSummary(candidate.resultSetSummary),
    updatedAt:
      typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
        ? candidate.updatedAt
        : null,
  };
}

async function writeSnapshot(next: ExploreFilterStateSnapshot): Promise<void> {
  await exploreFilterStateCache.waitForHydration();
  exploreFilterStateCache.set(STORAGE_KEY, JSON.stringify(next));
  await exploreFilterStateCache.flush();
}

export function getExploreFilterStateSnapshot(): ExploreFilterStateSnapshot {
  return snapshot;
}

export async function loadExploreFilterStateSnapshot(): Promise<ExploreFilterStateSnapshot> {
  await exploreFilterStateCache.waitForHydration();
  const raw = exploreFilterStateCache.get(STORAGE_KEY);
  if (!raw) {
    snapshot = { ...DEFAULT_SNAPSHOT };
    return snapshot;
  }

  try {
    snapshot = normalizeSnapshot(JSON.parse(raw));
  } catch {
    snapshot = { ...DEFAULT_SNAPSHOT };
  }

  return snapshot;
}

export async function saveExploreFilterStateSnapshot(
  partial: Partial<Omit<ExploreFilterStateSnapshot, 'updatedAt'>>,
): Promise<ExploreFilterStateSnapshot> {
  snapshot = normalizeSnapshot({
    ...snapshot,
    ...partial,
    updatedAt: new Date().toISOString(),
  });
  await writeSnapshot(snapshot);
  return snapshot;
}

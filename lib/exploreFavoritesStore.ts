import type { ExpeditionOpportunity } from './discoverEngine';
import {
  buildExploreNavigationPayload,
  type NavigationHandoffPayload,
  type NavigationTrailDecisionPoint,
  type NavigationTrailWaypoint,
  type NavigationTripMode,
} from './navigationHandoffStore';
import { createMigratingNonSecureStorage } from './nonSecureStorage';

const STORAGE_KEY = 'ecs_explore_favorites_v1';
const STORE_VERSION = 1;
const favoritesStorage = createMigratingNonSecureStorage('ecs_explore_favorites', {
  logTag: 'ExploreFavoritesStore',
});

type Listener = () => void;

export interface FavoriteTrailRecord {
  favoriteId: string;
  sourceTrailId: string;
  title: string;
  subtitle: string | null;
  coordinate: NavigationHandoffPayload['coordinate'];
  trailheadCoordinate: NavigationHandoffPayload['trailheadCoordinate'];
  roadDestinationCoordinate: NavigationHandoffPayload['roadDestinationCoordinate'];
  trailGeometry: NavigationHandoffPayload['trailGeometry'];
  trailLengthMiles: number | null;
  trailCategory: string | null;
  tripMode: NavigationTripMode | null;
  trailWaypoints: NavigationTrailWaypoint[];
  trailDecisionPoints: NavigationTrailDecisionPoint[];
  routeMetadata: NavigationHandoffPayload['routeMetadata'];
  landmarkMetadata: NavigationHandoffPayload['landmarkMetadata'];
  summary: string | null;
  imageTag: string | null;
  source: 'explore';
  savedAt: string;
  navigationPayload: NavigationHandoffPayload;
}

export interface FavoriteTrailPlanItem {
  planItemId: string;
  favoriteId: string | null;
  sourceTrailId: string;
  title: string;
  subtitle: string | null;
  navigationPayload: NavigationHandoffPayload;
}

export interface FavoriteTrailPlan {
  planId: string;
  title: string;
  orderedTrailIds: string[];
  orderedFavoriteIds: string[];
  items: FavoriteTrailPlanItem[];
  createdAt: string;
  updatedAt: string;
  notes: string | null;
}

export interface ExploreFavoritesSnapshot {
  version: number;
  hydrated: boolean;
  favorites: FavoriteTrailRecord[];
  plans: FavoriteTrailPlan[];
}

const listeners = new Set<Listener>();

let snapshot: ExploreFavoritesSnapshot = {
  version: STORE_VERSION,
  hydrated: false,
  favorites: [],
  plans: [],
};

let hydratePromise: Promise<void> | null = null;

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

function cloneSnapshot(): ExploreFavoritesSnapshot {
  return {
    ...snapshot,
    favorites: [...snapshot.favorites],
    plans: [...snapshot.plans],
  };
}

function setSnapshot(next: ExploreFavoritesSnapshot) {
  snapshot = next;
  emit();
}

async function readStorage(): Promise<string | null> {
  return favoritesStorage.read(STORAGE_KEY);
}

async function writeStorage(value: string | null): Promise<void> {
  await favoritesStorage.write(STORAGE_KEY, value);
}

function persistSnapshot(): Promise<void> {
  const payload = JSON.stringify({
    version: STORE_VERSION,
    favorites: snapshot.favorites,
    plans: snapshot.plans,
  });
  return writeStorage(payload);
}

function persistSnapshotDeferred() {
  void persistSnapshot().catch((error) => {
    console.warn('[ExploreFavoritesStore] Failed to persist snapshot:', error);
  });
}

function normalizeFavoriteRecord(value: unknown): FavoriteTrailRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<FavoriteTrailRecord>;
  if (!record.favoriteId || !record.sourceTrailId || !record.title || !record.navigationPayload) {
    return null;
  }

  return {
    favoriteId: String(record.favoriteId),
    sourceTrailId: String(record.sourceTrailId),
    title: String(record.title),
    subtitle: typeof record.subtitle === 'string' ? record.subtitle : null,
    coordinate: record.coordinate ?? record.navigationPayload.coordinate ?? null,
    trailheadCoordinate:
      record.trailheadCoordinate ?? record.navigationPayload.trailheadCoordinate ?? null,
    roadDestinationCoordinate:
      record.roadDestinationCoordinate ?? record.navigationPayload.roadDestinationCoordinate ?? null,
    trailGeometry: Array.isArray(record.trailGeometry) ? record.trailGeometry : [],
    trailLengthMiles:
      Number.isFinite(Number(record.trailLengthMiles)) ? Number(record.trailLengthMiles) : null,
    trailCategory: typeof record.trailCategory === 'string' ? record.trailCategory : null,
    tripMode: record.tripMode ?? record.navigationPayload.tripMode ?? null,
    trailWaypoints: Array.isArray(record.trailWaypoints) ? record.trailWaypoints : [],
    trailDecisionPoints: Array.isArray(record.trailDecisionPoints) ? record.trailDecisionPoints : [],
    routeMetadata:
      record.routeMetadata && typeof record.routeMetadata === 'object'
        ? record.routeMetadata
        : record.navigationPayload.routeMetadata ?? null,
    landmarkMetadata:
      record.landmarkMetadata && typeof record.landmarkMetadata === 'object'
        ? record.landmarkMetadata
        : record.navigationPayload.landmarkMetadata ?? null,
    summary: typeof record.summary === 'string' ? record.summary : null,
    imageTag: typeof record.imageTag === 'string' ? record.imageTag : null,
    source: 'explore',
    savedAt:
      typeof record.savedAt === 'string' && record.savedAt.length > 0
        ? record.savedAt
        : new Date().toISOString(),
    navigationPayload: record.navigationPayload,
  };
}

function normalizePlanItem(value: unknown, fallbackIndex: number): FavoriteTrailPlanItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<FavoriteTrailPlanItem>;
  if (!item.sourceTrailId || !item.title || !item.navigationPayload) return null;

  return {
    planItemId:
      typeof item.planItemId === 'string' && item.planItemId.length > 0
        ? item.planItemId
        : `plan-item-${fallbackIndex}`,
    favoriteId: typeof item.favoriteId === 'string' ? item.favoriteId : null,
    sourceTrailId: String(item.sourceTrailId),
    title: String(item.title),
    subtitle: typeof item.subtitle === 'string' ? item.subtitle : null,
    navigationPayload: item.navigationPayload,
  };
}

function normalizePlanRecord(value: unknown): FavoriteTrailPlan | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as Partial<FavoriteTrailPlan>;
  if (!plan.planId || !Array.isArray(plan.items) || plan.items.length === 0) return null;

  const items = plan.items
    .map((item, index) => normalizePlanItem(item, index))
    .filter((item): item is FavoriteTrailPlanItem => !!item);

  if (items.length === 0) return null;

  const orderedFavoriteIds = Array.isArray(plan.orderedFavoriteIds)
    ? plan.orderedFavoriteIds.filter((entry): entry is string => typeof entry === 'string')
    : items
        .map((item) => item.favoriteId)
        .filter((entry): entry is string => typeof entry === 'string');

  const orderedTrailIds = Array.isArray(plan.orderedTrailIds)
    ? plan.orderedTrailIds.filter((entry): entry is string => typeof entry === 'string')
    : items.map((item) => item.sourceTrailId);

  return {
    planId: String(plan.planId),
    title:
      typeof plan.title === 'string' && plan.title.trim().length > 0
        ? plan.title.trim()
        : `Trail Stack ${items.length}`,
    orderedFavoriteIds,
    orderedTrailIds,
    items,
    createdAt:
      typeof plan.createdAt === 'string' && plan.createdAt.length > 0
        ? plan.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof plan.updatedAt === 'string' && plan.updatedAt.length > 0
        ? plan.updatedAt
        : new Date().toISOString(),
    notes: typeof plan.notes === 'string' ? plan.notes : null,
  };
}

function buildFavoriteId(routeId: string) {
  return `explore-favorite:${routeId}`;
}

function buildPlanItem(favorite: FavoriteTrailRecord): FavoriteTrailPlanItem {
  return {
    planItemId: `${favorite.favoriteId}:${favorite.savedAt}`,
    favoriteId: favorite.favoriteId,
    sourceTrailId: favorite.sourceTrailId,
    title: favorite.title,
    subtitle: favorite.subtitle,
    navigationPayload: favorite.navigationPayload,
  };
}

function createPlanTitle(favorites: FavoriteTrailRecord[]): string {
  if (favorites.length === 0) return 'Trail Stack';
  if (favorites.length === 1) return favorites[0].title;
  return `${favorites[0].title} + ${favorites.length - 1}`;
}

export function subscribeExploreFavorites(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getExploreFavoritesSnapshot(): ExploreFavoritesSnapshot {
  return cloneSnapshot();
}

export async function hydrateExploreFavoritesStore(force = false): Promise<void> {
  if (snapshot.hydrated && !force) return;
  if (hydratePromise && !force) return hydratePromise;

  hydratePromise = (async () => {
    const raw = await readStorage();
    if (!raw) {
      setSnapshot({
        version: STORE_VERSION,
        hydrated: true,
        favorites: [],
        plans: [],
      });
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        favorites?: unknown[];
        plans?: unknown[];
      };
      const favorites = Array.isArray(parsed.favorites)
        ? parsed.favorites
            .map(normalizeFavoriteRecord)
            .filter((item): item is FavoriteTrailRecord => !!item)
        : [];
      const dedupedFavorites = Array.from(
        new Map(favorites.map((item) => [item.sourceTrailId, item])).values(),
      ).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      const plans = Array.isArray(parsed.plans)
        ? parsed.plans
            .map(normalizePlanRecord)
            .filter((item): item is FavoriteTrailPlan => !!item)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [];

      setSnapshot({
        version: STORE_VERSION,
        hydrated: true,
        favorites: dedupedFavorites,
        plans,
      });
    } catch {
      setSnapshot({
        version: STORE_VERSION,
        hydrated: true,
        favorites: [],
        plans: [],
      });
    }
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export function buildFavoriteTrailRecord(route: ExpeditionOpportunity): FavoriteTrailRecord {
  const navigationPayload = buildExploreNavigationPayload(route);
  return {
    favoriteId: buildFavoriteId(String(route.id)),
    sourceTrailId: String(route.id),
    title: navigationPayload.title,
    subtitle: navigationPayload.subtitle,
    coordinate: navigationPayload.coordinate,
    trailheadCoordinate: navigationPayload.trailheadCoordinate,
    roadDestinationCoordinate: navigationPayload.roadDestinationCoordinate,
    trailGeometry: navigationPayload.trailGeometry,
    trailLengthMiles: navigationPayload.trailLengthMiles,
    trailCategory: navigationPayload.trailCategory,
    tripMode: navigationPayload.tripMode,
    trailWaypoints: navigationPayload.trailWaypoints,
    trailDecisionPoints: navigationPayload.trailDecisionPoints,
    routeMetadata: navigationPayload.routeMetadata,
    landmarkMetadata: navigationPayload.landmarkMetadata,
    summary: typeof route.description === 'string' ? route.description : null,
    imageTag: typeof route.imageTag === 'string' ? route.imageTag : null,
    source: 'explore',
    savedAt: new Date().toISOString(),
    navigationPayload,
  };
}

export function isTrailFavorited(sourceTrailId: string): boolean {
  return snapshot.favorites.some((favorite) => favorite.sourceTrailId === sourceTrailId);
}

export function getFavoriteTrailById(favoriteId: string): FavoriteTrailRecord | null {
  return snapshot.favorites.find((favorite) => favorite.favoriteId === favoriteId) ?? null;
}

export function getFavoriteTrailBySourceId(sourceTrailId: string): FavoriteTrailRecord | null {
  return snapshot.favorites.find((favorite) => favorite.sourceTrailId === sourceTrailId) ?? null;
}

export function addFavoriteTrail(route: ExpeditionOpportunity): FavoriteTrailRecord {
  const existing = getFavoriteTrailBySourceId(String(route.id));
  if (existing) return existing;

  const favorite = buildFavoriteTrailRecord(route);
  setSnapshot({
    ...snapshot,
    hydrated: true,
    favorites: [favorite, ...snapshot.favorites].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
  });
  persistSnapshotDeferred();
  return favorite;
}

export function removeFavoriteTrailBySourceId(sourceTrailId: string): void {
  if (!isTrailFavorited(sourceTrailId)) return;
  setSnapshot({
    ...snapshot,
    hydrated: true,
    favorites: snapshot.favorites.filter((favorite) => favorite.sourceTrailId !== sourceTrailId),
  });
  persistSnapshotDeferred();
}

export function toggleFavoriteTrail(route: ExpeditionOpportunity): boolean {
  if (isTrailFavorited(String(route.id))) {
    removeFavoriteTrailBySourceId(String(route.id));
    return false;
  }
  addFavoriteTrail(route);
  return true;
}

export function upsertFavoriteTrailPlan(input: {
  favoriteIds: string[];
  planId?: string | null;
  title?: string | null;
}): FavoriteTrailPlan | null {
  const favorites = input.favoriteIds
    .map((favoriteId) => getFavoriteTrailById(favoriteId))
    .filter((favorite): favorite is FavoriteTrailRecord => !!favorite);

  if (favorites.length < 2) {
    return null;
  }

  const existing = input.planId
    ? snapshot.plans.find((plan) => plan.planId === input.planId) ?? null
    : null;
  const now = new Date().toISOString();
  const plan: FavoriteTrailPlan = {
    planId: existing?.planId ?? `trail-plan:${now}:${favorites.length}`,
    title:
      typeof input.title === 'string' && input.title.trim().length > 0
        ? input.title.trim()
        : existing?.title ?? createPlanTitle(favorites),
    orderedTrailIds: favorites.map((favorite) => favorite.sourceTrailId),
    orderedFavoriteIds: favorites.map((favorite) => favorite.favoriteId),
    items: favorites.map(buildPlanItem),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    notes: existing?.notes ?? null,
  };

  const nextPlans = existing
    ? snapshot.plans.map((entry) => (entry.planId === plan.planId ? plan : entry))
    : [plan, ...snapshot.plans];

  setSnapshot({
    ...snapshot,
    hydrated: true,
    plans: nextPlans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  });
  persistSnapshotDeferred();
  return plan;
}

export function removeFavoriteTrailPlan(planId: string): void {
  if (!snapshot.plans.some((plan) => plan.planId === planId)) return;
  setSnapshot({
    ...snapshot,
    hydrated: true,
    plans: snapshot.plans.filter((plan) => plan.planId !== planId),
  });
  persistSnapshotDeferred();
}

export async function clearExploreFavoritesStore(): Promise<void> {
  setSnapshot({
    version: STORE_VERSION,
    hydrated: true,
    favorites: [],
    plans: [],
  });
  await writeStorage(null);
}

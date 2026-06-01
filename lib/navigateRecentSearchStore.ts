import { createMigratingNonSecureStorage } from './nonSecureStorage';
import type {
  RoadNavCoordinate,
  RoadNavSearchSuggestion,
  RoadNavSourceType,
} from './mapboxRoadNavigation';

const STORAGE_KEY = 'recent_searches_v1';
const MAX_RECENT_SEARCHES = 8;

const recentSearchStorage = createMigratingNonSecureStorage(
  'ecs_navigate_recent_searches',
  { logTag: 'NavigateRecentSearches' },
);

type PersistedRecentRoadSearch = {
  id: string;
  title: string;
  subtitle: string | null;
  sourceType: RoadNavSourceType;
  mapboxId: string | null;
  coordinate: RoadNavCoordinate | null;
  savedAt: string;
};

function toSearchSuggestion(
  value: PersistedRecentRoadSearch,
): RoadNavSearchSuggestion | null {
  const title = String(value?.title ?? '').trim();
  if (!title) return null;

  return {
    id: String(value.id ?? value.mapboxId ?? `recent-${Date.now()}`),
    title,
    subtitle: value.subtitle ? String(value.subtitle) : null,
    sourceType: value.sourceType,
    mapboxId: value.mapboxId ? String(value.mapboxId) : null,
    coordinate:
      value.coordinate &&
      Number.isFinite(value.coordinate.lat) &&
      Number.isFinite(value.coordinate.lng)
        ? {
            lat: Number(value.coordinate.lat),
            lng: Number(value.coordinate.lng),
          }
        : null,
  };
}

function toPersistedRecentRoadSearch(
  suggestion: RoadNavSearchSuggestion,
): PersistedRecentRoadSearch | null {
  const title = String(suggestion?.title ?? '').trim();
  if (!title) return null;

  return {
    id: String(suggestion.id ?? suggestion.mapboxId ?? `recent-${Date.now()}`),
    title,
    subtitle: suggestion.subtitle ? String(suggestion.subtitle) : null,
    sourceType: suggestion.sourceType,
    mapboxId: suggestion.mapboxId ? String(suggestion.mapboxId) : null,
    coordinate:
      suggestion.coordinate &&
      Number.isFinite(suggestion.coordinate.lat) &&
      Number.isFinite(suggestion.coordinate.lng)
        ? {
            lat: Number(suggestion.coordinate.lat),
            lng: Number(suggestion.coordinate.lng),
          }
        : null,
    savedAt: new Date().toISOString(),
  };
}

function getRecentSearchKey(
  search: Pick<PersistedRecentRoadSearch, 'mapboxId' | 'title' | 'subtitle' | 'coordinate'>,
): string {
  if (search.mapboxId) return `mapbox:${search.mapboxId}`;

  const coordinateKey = search.coordinate
    ? `${search.coordinate.lat.toFixed(5)},${search.coordinate.lng.toFixed(5)}`
    : 'no-coordinate';

  return [
    search.title.trim().toLowerCase(),
    (search.subtitle ?? '').trim().toLowerCase(),
    coordinateKey,
  ].join('|');
}

async function readPersistedRecentSearches(): Promise<PersistedRecentRoadSearch[]> {
  try {
    const raw = await recentSearchStorage.read(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as PersistedRecentRoadSearch[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) =>
        entry && typeof entry === 'object'
          ? {
              id: String((entry as PersistedRecentRoadSearch).id ?? ''),
              title: String((entry as PersistedRecentRoadSearch).title ?? ''),
              subtitle: (entry as PersistedRecentRoadSearch).subtitle ?? null,
              sourceType:
                (entry as PersistedRecentRoadSearch).sourceType ?? 'forward_geocode',
              mapboxId: (entry as PersistedRecentRoadSearch).mapboxId ?? null,
              coordinate: (entry as PersistedRecentRoadSearch).coordinate ?? null,
              savedAt: String((entry as PersistedRecentRoadSearch).savedAt ?? ''),
            }
          : null,
      )
      .filter((entry): entry is PersistedRecentRoadSearch => !!entry);
  } catch {
    return [];
  }
}

async function writePersistedRecentSearches(
  searches: PersistedRecentRoadSearch[],
): Promise<void> {
  try {
    await recentSearchStorage.write(STORAGE_KEY, JSON.stringify(searches));
  } catch {}
}

export async function loadRecentRoadSearches(): Promise<RoadNavSearchSuggestion[]> {
  const persisted = await readPersistedRecentSearches();
  return persisted
    .sort((left, right) => {
      const leftTs = new Date(left.savedAt).getTime();
      const rightTs = new Date(right.savedAt).getTime();
      return rightTs - leftTs;
    })
    .map((entry) => toSearchSuggestion(entry))
    .filter((entry): entry is RoadNavSearchSuggestion => !!entry)
    .slice(0, MAX_RECENT_SEARCHES);
}

export async function rememberRecentRoadSearch(
  suggestion: RoadNavSearchSuggestion,
): Promise<RoadNavSearchSuggestion[]> {
  const nextEntry = toPersistedRecentRoadSearch(suggestion);
  if (!nextEntry) {
    return loadRecentRoadSearches();
  }

  const existing = await readPersistedRecentSearches();
  const nextKey = getRecentSearchKey(nextEntry);

  const merged = [
    nextEntry,
    ...existing.filter((entry) => getRecentSearchKey(entry) !== nextKey),
  ].slice(0, MAX_RECENT_SEARCHES);

  await writePersistedRecentSearches(merged);
  return merged
    .map((entry) => toSearchSuggestion(entry))
    .filter((entry): entry is RoadNavSearchSuggestion => !!entry);
}

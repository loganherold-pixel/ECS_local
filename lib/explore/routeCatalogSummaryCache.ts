import type { RouteCatalogSummary } from '../routeDataContracts';

export const EXPLORE_CATALOG_SUMMARY_CACHE_KEY = 'explore.catalog.summary.v2';
export const EXPLORE_CATALOG_SUMMARY_CACHE_TTL_MS = 15 * 60 * 1000;
export const EXPLORE_CATALOG_SUMMARY_CACHE_STALE_MS = 6 * 60 * 60 * 1000;

export type RouteCatalogSummaryCacheStatus = 'hit' | 'stale' | 'miss';

export type RouteCatalogSummaryCacheEntry = {
  summaries: RouteCatalogSummary[];
  storedAtMs: number;
};

export type RouteCatalogSummaryCache = {
  ttlMs: number;
  staleMs: number;
  maxEntries: number;
  entries: Map<string, RouteCatalogSummaryCacheEntry>;
  get: (
    key: string,
    nowMs?: number,
  ) => { status: RouteCatalogSummaryCacheStatus; summaries: RouteCatalogSummary[] | null };
  set: (key: string, summaries: RouteCatalogSummary[], nowMs?: number) => void;
  clear: () => void;
};

export type RouteCatalogSummaryPage = {
  items: RouteCatalogSummary[];
  pageIndex: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  windowStart: number;
  windowEnd: number;
};

function normalizeRegionId(regionId: string): string {
  const normalized = String(regionId ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'all';
}

export function exploreCatalogRegionCacheKey(regionId: string): string {
  return `explore.catalog.region.${normalizeRegionId(regionId)}.v2`;
}

export function createRouteCatalogSummaryCache(
  options: { ttlMs?: number; staleMs?: number; maxEntries?: number } = {},
): RouteCatalogSummaryCache {
  const ttlMs = options.ttlMs ?? EXPLORE_CATALOG_SUMMARY_CACHE_TTL_MS;
  const staleMs = options.staleMs ?? EXPLORE_CATALOG_SUMMARY_CACHE_STALE_MS;
  const maxEntries = Math.max(1, Math.round(options.maxEntries ?? 24));
  const entries = new Map<string, RouteCatalogSummaryCacheEntry>();

  return {
    ttlMs,
    staleMs,
    maxEntries,
    entries,
    get(key, nowMs = Date.now()) {
      const cached = entries.get(key);
      if (!cached) return { status: 'miss', summaries: null };
      const ageMs = Math.max(0, nowMs - cached.storedAtMs);
      if (ageMs <= ttlMs + staleMs) {
        entries.delete(key);
        entries.set(key, cached);
      }
      if (ageMs <= ttlMs) return { status: 'hit', summaries: [...cached.summaries] };
      if (ageMs <= ttlMs + staleMs) return { status: 'stale', summaries: [...cached.summaries] };
      entries.delete(key);
      return { status: 'miss', summaries: null };
    },
    set(key, summaries, nowMs = Date.now()) {
      entries.delete(key);
      entries.set(key, { summaries: [...summaries], storedAtMs: nowMs });
      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (typeof oldestKey !== 'string') break;
        entries.delete(oldestKey);
      }
    },
    clear() {
      entries.clear();
    },
  };
}

export function paginateRouteCatalogSummaries(
  summaries: RouteCatalogSummary[],
  options: { pageIndex?: number; pageSize?: number } = {},
): RouteCatalogSummaryPage {
  const pageSize = Math.max(1, Math.round(Number(options.pageSize ?? 10)));
  const totalItems = summaries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pageIndex = Math.min(Math.max(0, Math.round(Number(options.pageIndex ?? 0))), totalPages - 1);
  const offset = pageIndex * pageSize;
  const items = summaries.slice(offset, offset + pageSize);
  return {
    items,
    pageIndex,
    pageSize,
    totalItems,
    totalPages,
    windowStart: totalItems === 0 ? 0 : offset + 1,
    windowEnd: Math.min(offset + items.length, totalItems),
  };
}

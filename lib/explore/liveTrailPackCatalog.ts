import { supabase } from '../supabase';
import {
  catalogRouteToTrailPack,
  getRouteCatalogCoverageState,
  normalizeRouteCatalogDetailResponse,
  normalizeRouteCatalogSearchResponse,
  verifyRouteCatalogRecord,
  type RouteCatalogCoverageState,
  type RouteCatalogRecord,
  type RouteCatalogSearchMeta,
} from './routeCatalog';
import {
  buildExploreRouteCatalogQueryDiagnostic,
  logRouteCatalogVisibilityDiagnostic,
} from '../routeCatalogVisibilityDiagnostics';
import {
  normalizeRouteCatalogSummary,
  type RouteCatalogSummary,
  type RouteCatalogSourceType,
} from '../routeDataContracts';
import { createPersistedKeyValueCache } from '../keyValuePersistence';
import {
  EXPLORE_ANONYMOUS_ACCESS_PARTITION,
  normalizeExploreAccessContextPartition,
} from '../auth/exploreAccessContextPartition';
import {
  beginECSAsyncSurfaceRequest,
  cancelECSAsyncSurfaceRequest,
  createECSAsyncRequestFingerprint,
  createECSAsyncSurfaceState,
  disableECSAsyncSurface,
  settleECSAsyncSurfaceRequest,
  type ECSAsyncCancellationReason,
  type ECSAsyncSurfaceState,
  type ECSAsyncSurfaceStatus,
} from '../state/asyncSurfaceState';
import {
  EXPLORE_CATALOG_SUMMARY_CACHE_KEY,
  EXPLORE_CATALOG_SUMMARY_CACHE_STALE_MS,
  EXPLORE_CATALOG_SUMMARY_CACHE_TTL_MS,
  exploreCatalogAccessCacheKey,
  exploreCatalogRegionCacheKey,
} from './routeCatalogSummaryCache';
import {
  buildExplorePerformanceSummary,
  createExplorePerformanceRun,
  getExplorePerformanceNow,
  logExplorePerformanceDiagnostic,
  recordExplorePerformancePhase,
} from './explorePerformanceDiagnostics';
import {
  ECS_ROUTE_CATALOG_REQUEST_ID_HEADER,
  createECSRouteCatalogRequestId,
  logRouteCatalogClientCorrelationDiagnostic,
  normalizeECSRouteCatalogRequestId,
  resolveECSRouteCatalogResponseRequestCorrelation,
} from './routeCatalogRequestCorrelation';
import {
  ECS_ROUTE_SEARCH_DEFAULT_PAGE_SIZE,
  ECS_ROUTE_SEARCH_MAX_PAGE_SIZE,
  dedupeUniqueRankedRoutes,
  normalizeRouteSearchPageSize,
} from './routeSearchResultPolicy';
import {
  trailMatchesExploreRefinement,
  type ExploreRefinementFilter,
} from './exploreRefinementFilter';
import type {
  ECSTrailPack,
  ECSTrailPackCoordinate,
  ECSTrailPackDifficulty,
  ECSTrailPackReviewStatus,
  ECSTrailPackRouteGeometry,
  ECSTrailPackRouteType,
  ECSTrailPackSource,
} from './trailPacks';

export type LiveTrailPackCatalogStatus = ECSAsyncSurfaceStatus;

export type LiveTrailPackCatalogSafeDiagnostic = {
  routeId: string;
  publicId: string | null;
  name: string | null;
  exclusionReasons: string[];
  sourceTypes: string[];
  reviewStatus: string | null;
  recommendationStatus: string | null;
  updatedAt: string | null;
};

export type LiveTrailPackCatalogData = {
  trailPacks: ECSTrailPack[];
  guidanceDiagnosticTrailPacks: ECSTrailPack[];
  guidanceDiagnosticRecords: LiveTrailPackCatalogSafeDiagnostic[];
  routeCatalogSummaries: RouteCatalogSummary[];
};

export type LiveTrailPackCatalogRefreshOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  cancellationReason?: ECSAsyncCancellationReason;
  sourceVersion?: string | null;
  retryEcsRequestId?: string | null;
};

export type LiveTrailPackCatalogSearchCriteria = {
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
  vehicleClass?: string | null;
  minDistanceMiles?: number | null;
  maxDistanceMiles?: number | null;
  minDurationMinutes?: number | null;
  maxDurationMinutes?: number | null;
  routeType?: ECSTrailPackRouteType | string | null;
  difficulty?: ECSTrailPackDifficulty | string | null;
  minConfidenceScore?: number | null;
  minRemotenessScore?: number | null;
  maxRemotenessScore?: number | null;
  minCampabilityScore?: number | null;
  availableFuelRangeMiles?: number | null;
  availableWaterCapacityGallons?: number | null;
  locationSource?: 'live_gps' | 'default_location' | string | null;
  regionId?: string | null;
  page?: number | null;
  pageSize?: number | null;
  continuationCursor?: string | null;
  limit?: number;
  expectedKnownRoutes?: string[] | null;
  includePreviewGeometry?: boolean | null;
  includeCoverageDiagnostics?: boolean | null;
  /** Complete non-location UI search identity (query/category/refinement/source). */
  searchFingerprint?: string | null;
  /** Privacy-safe local-only auth/cache partition. Never sent to the backend. */
  accessContextPartition?: string | null;
  exploreRefinement?: 'remoteness' | 'dayTrip' | 'weekendTrip' | 'expedition' | string | null;
};

export type LiveTrailPackCatalogSnapshot = {
  trailPacks: ECSTrailPack[];
  guidanceDiagnosticTrailPacks: ECSTrailPack[];
  guidanceDiagnosticRecords: LiveTrailPackCatalogSafeDiagnostic[];
  routeCatalogSummaries: RouteCatalogSummary[];
  status: LiveTrailPackCatalogStatus;
  error: string | null;
  lastLoadedAt: string | null;
  lastRefreshAttemptAt: string | null;
  coverageState: RouteCatalogCoverageState;
  searchMeta: RouteCatalogSearchMeta | null;
  /** Latest live request attempt; distinct from searchMeta.ecsRequestId while stale data renders. */
  ecsRequestId: string | null;
  /** In-memory-only semantic request key used to constrain exact-request retries. */
  ecsRequestKey: string | null;
  source: 'route_catalog' | 'trail_packs_fallback' | 'unavailable';
  /** Privacy-safe local partition that owns every route and diagnostic in this snapshot. */
  accessContextPartition: string;
  refreshKey: string | null;
  preservedFromEmptyRefresh: boolean;
  preservedReason: string | null;
  asyncState: ECSAsyncSurfaceState<LiveTrailPackCatalogData>;
};

export type RouteCatalogPaginationProgress = {
  loadedCatalogCount: number;
  matchedCatalogCount: number;
  matchedCatalogCountIsLowerBound: boolean;
  visibleCatalogCardCount: number;
  nonCatalogCandidateCount: number;
  label: string;
};

export const ROUTE_CATALOG_PAGINATION_CONTRACT_VERSION =
  'route_catalog_ranked_page_v1';

export function buildRouteCatalogPaginationProgress(args: {
  loadedCatalogCount: number;
  totalMatchedCount?: number | null;
  totalMatchedCountBounded?: boolean | null;
  visibleCatalogCardCount: number;
  visibleCandidateCount: number;
}): RouteCatalogPaginationProgress {
  const loadedCatalogCount = Math.max(0, Math.floor(args.loadedCatalogCount));
  const matchedCatalogCount = Math.max(
    loadedCatalogCount,
    Math.max(0, Math.floor(args.totalMatchedCount ?? loadedCatalogCount)),
  );
  const visibleCatalogCardCount = Math.min(
    loadedCatalogCount,
    Math.max(0, Math.floor(args.visibleCatalogCardCount)),
  );
  const nonCatalogCandidateCount = Math.max(
    0,
    Math.floor(args.visibleCandidateCount) - visibleCatalogCardCount,
  );
  const matchedCatalogCountIsLowerBound = args.totalMatchedCountBounded === true;
  const hasAdditionalMatches = matchedCatalogCount > loadedCatalogCount;
  const matchedSuffix = matchedCatalogCountIsLowerBound ? '+' : '';
  const catalogLabel = hasAdditionalMatches
    ? `${loadedCatalogCount} OF ${matchedCatalogCount}${matchedSuffix} CATALOG ROUTES LOADED`
    : `${loadedCatalogCount} CATALOG ROUTES LOADED`;
  const loadedLabel = nonCatalogCandidateCount > 0
    ? `${catalogLabel} • ${nonCatalogCandidateCount} NON-CATALOG CANDIDATES IN THE CURRENT VIEW`
    : catalogLabel;

  return {
    loadedCatalogCount,
    matchedCatalogCount,
    matchedCatalogCountIsLowerBound,
    visibleCatalogCardCount,
    nonCatalogCandidateCount,
    label: loadedLabel,
  };
}

type Listener = () => void;

const listeners = new Set<Listener>();
let refreshRequestSequence = 0;
let sharedRequestSubscriberSequence = 0;
type SharedRequestSubscriberOwner<T> = {
  promise: Promise<T>;
  controller: AbortController;
  subscribers: Set<number>;
  cancelWhenUnobserved: (reason: ECSAsyncCancellationReason) => void;
};
type PendingCatalogRefresh = SharedRequestSubscriberOwner<LiveTrailPackCatalogSnapshot> & {
  requestSequence: number;
};
const pendingRefreshesByKey = new Map<string, PendingCatalogRefresh>();
let activeCatalogRefresh: PendingCatalogRefresh & { refreshKey: string } | null = null;
const ROUTE_CATALOG_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const ROUTE_CATALOG_DETAIL_CACHE_MAX_ENTRIES = 24;
const ROUTE_CATALOG_REQUEST_TIMEOUT_MS = 12_000;
type PendingDetailRequest = SharedRequestSubscriberOwner<ECSTrailPack> & {
  routeId: string;
  generation: number;
};
const pendingDetailRequestsByKey = new Map<string, PendingDetailRequest>();
const routeCatalogDetailCache = new Map<
  string,
  { trailPack: ECSTrailPack; routeId: string; sourceVersion: string; storedAtMs: number }
>();
const routeCatalogDetailGenerations = new Map<string, number>();
function emptyLiveTrailPackCatalogSnapshot(
  accessContextPartition: unknown,
): LiveTrailPackCatalogSnapshot {
  return {
    trailPacks: [],
    guidanceDiagnosticTrailPacks: [],
    guidanceDiagnosticRecords: [],
    routeCatalogSummaries: [],
    status: 'idle',
    error: null,
    lastLoadedAt: null,
    lastRefreshAttemptAt: null,
    coverageState: getRouteCatalogCoverageState([], { userHasCriteria: false }),
    searchMeta: null,
    ecsRequestId: null,
    ecsRequestKey: null,
    source: 'unavailable',
    accessContextPartition: normalizeExploreAccessContextPartition(accessContextPartition),
    refreshKey: null,
    preservedFromEmptyRefresh: false,
    preservedReason: null,
    asyncState: createECSAsyncSurfaceState<LiveTrailPackCatalogData>({
      surfaceId: 'explore_guidance_ready_routes',
      provider: 'route-catalog-search',
    }),
  };
}

let snapshot = emptyLiveTrailPackCatalogSnapshot(EXPLORE_ANONYMOUS_ACCESS_PARTITION);

const TRAIL_PACK_SELECT = [
  'id',
  'public_id',
  'name',
  'description',
  'source',
  'route_type',
  'center_latitude',
  'center_longitude',
  'distance_miles',
  'estimated_duration_minutes',
  'difficulty',
  'vehicle_fit',
  'confidence_score',
  'confidence_reasons',
  'last_verified_at',
  'positive_feedback_count',
  'negative_feedback_count',
  'completion_count',
  'review_status',
  'tags',
  'created_at',
  'updated_at',
].join(',');

const ROUTE_CATALOG_DEFAULT_SEARCH_LIMIT = ECS_ROUTE_SEARCH_MAX_PAGE_SIZE;
const ROUTE_CATALOG_SUMMARY_PAGE_SIZE = ECS_ROUTE_SEARCH_DEFAULT_PAGE_SIZE;
const ROUTE_CATALOG_STAGED_REFRESH_LIMIT = ECS_ROUTE_SEARCH_DEFAULT_PAGE_SIZE;
const routeCatalogSummaryPersistentCache = createPersistedKeyValueCache(EXPLORE_CATALOG_SUMMARY_CACHE_KEY);

class InvalidRouteCatalogSearchResponseError extends Error {
  constructor() {
    super('Verified route catalog returned an invalid response.');
    this.name = 'InvalidRouteCatalogSearchResponseError';
  }
}

type CatalogRequestLifecycle = {
  controller: AbortController;
  cleanup: () => void;
  didTimeout: () => boolean;
};

function createCatalogRequestLifecycle(
  options: LiveTrailPackCatalogRefreshOptions = {},
): CatalogRequestLifecycle {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = Math.max(1, Math.min(60_000, options.timeoutMs ?? ROUTE_CATALOG_REQUEST_TIMEOUT_MS));
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort('timeout');
  }, timeoutMs);
  return {
    controller,
    cleanup: () => {
      clearTimeout(timeoutId);
    },
    didTimeout: () => timedOut,
  };
}

function createCatalogAbortError(message = 'Route catalog request cancelled.'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function throwIfCatalogRequestAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createCatalogAbortError();
}

function awaitCatalogRequest<T>(request: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(request);
  if (signal.aborted) return Promise.reject(createCatalogAbortError());
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      cleanup();
      reject(createCatalogAbortError());
    };
    const cleanup = () => signal.removeEventListener('abort', handleAbort);
    signal.addEventListener('abort', handleAbort, { once: true });
    Promise.resolve(request).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function isCatalogAbortError(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
}

function subscribeToSharedRequest<T>(
  owner: SharedRequestSubscriberOwner<T>,
  options: LiveTrailPackCatalogRefreshOptions,
  waitForTerminalWhenLastConsumerCancels = false,
): Promise<T> {
  const subscriberId = sharedRequestSubscriberSequence + 1;
  sharedRequestSubscriberSequence = subscriberId;
  owner.subscribers.add(subscriberId);
  const signal = options.signal;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const release = () => {
      owner.subscribers.delete(subscriberId);
      signal?.removeEventListener('abort', handleAbort);
    };
    const settleFromOwner = () => {
      owner.promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          release();
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          release();
          reject(error);
        },
      );
    };
    const handleAbort = () => {
      if (settled) return;
      settled = true;
      release();
      const reason = options.cancellationReason ?? 'consumer_cancelled';
      if (owner.subscribers.size === 0) {
        owner.cancelWhenUnobserved(reason);
        if (waitForTerminalWhenLastConsumerCancels) {
          owner.promise.then(resolve, reject);
          return;
        }
      }
      reject(createCatalogAbortError());
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener('abort', handleAbort, { once: true });
    settleFromOwner();
  });
}

function catalogResultCount(data: LiveTrailPackCatalogData): number {
  return Math.max(data.trailPacks.length, data.routeCatalogSummaries.length)
    + data.guidanceDiagnosticTrailPacks.length
    + data.guidanceDiagnosticRecords.length;
}

function catalogUniqueRouteCount(data: LiveTrailPackCatalogData | null | undefined): number {
  if (!data) return 0;
  const ids = new Set<string>();
  data.trailPacks.forEach((trailPack) => {
    const id = String(trailPack.id ?? '').trim();
    if (id) ids.add(id);
  });
  data.routeCatalogSummaries.forEach((summary) => {
    const id = String(summary.routeId ?? '').trim();
    if (id) ids.add(id);
  });
  return ids.size;
}

function hasUsableCatalogData(data: LiveTrailPackCatalogData | null | undefined): data is LiveTrailPackCatalogData {
  return Boolean(data && catalogResultCount(data) > 0);
}

function mergeCatalogItemsById<T>(
  baseItems: T[],
  pageItems: T[],
  getId: (item: T) => string,
): T[] {
  const latestById = new Map<string, T>();
  pageItems.forEach((item) => {
    const id = getId(item).trim();
    if (id) latestById.set(id, item);
  });
  const merged = baseItems.map((item) => latestById.get(getId(item).trim()) ?? item);
  const baseIds = new Set(baseItems.map((item) => getId(item).trim()).filter(Boolean));
  pageItems.forEach((item) => {
    if (!baseIds.has(getId(item).trim())) merged.push(item);
  });
  return dedupeUniqueRankedRoutes(merged, getId);
}

function normalizeLiveTrailPackCatalogData(
  data: LiveTrailPackCatalogData | null | undefined,
): LiveTrailPackCatalogData | null {
  if (!data) return null;
  return {
    trailPacks: dedupeUniqueRankedRoutes(data.trailPacks, (trailPack) => trailPack.id),
    guidanceDiagnosticTrailPacks: dedupeUniqueRankedRoutes(
      data.guidanceDiagnosticTrailPacks,
      (trailPack) => trailPack.id,
    ),
    guidanceDiagnosticRecords: dedupeUniqueRankedRoutes(
      data.guidanceDiagnosticRecords,
      (diagnostic) => diagnostic.routeId,
    ),
    routeCatalogSummaries: dedupeUniqueRankedRoutes(
      data.routeCatalogSummaries,
      (summary) => summary.routeId,
    ),
  };
}

function mergeLiveTrailPackCatalogData(
  baseData: LiveTrailPackCatalogData | null | undefined,
  pageData: LiveTrailPackCatalogData | null | undefined,
): LiveTrailPackCatalogData | null {
  if (!baseData && !pageData) return null;
  return normalizeLiveTrailPackCatalogData({
    trailPacks: mergeCatalogItemsById(
      baseData?.trailPacks ?? [],
      pageData?.trailPacks ?? [],
      (trailPack) => trailPack.id,
    ),
    guidanceDiagnosticTrailPacks: mergeCatalogItemsById(
      baseData?.guidanceDiagnosticTrailPacks ?? [],
      pageData?.guidanceDiagnosticTrailPacks ?? [],
      (trailPack) => trailPack.id,
    ),
    guidanceDiagnosticRecords: mergeCatalogItemsById(
      baseData?.guidanceDiagnosticRecords ?? [],
      pageData?.guidanceDiagnosticRecords ?? [],
      (diagnostic) => diagnostic.routeId,
    ),
    routeCatalogSummaries: mergeCatalogItemsById(
      baseData?.routeCatalogSummaries ?? [],
      pageData?.routeCatalogSummaries ?? [],
      (summary) => summary.routeId,
    ),
  });
}

function routeCatalogRefreshFamilyKey(refreshKey: string | null | undefined): string | null {
  if (!refreshKey) return null;
  try {
    const parsed = readRecord(JSON.parse(refreshKey));
    if (!parsed) return null;
    const family = { ...parsed };
    delete family.page;
    delete family.offset;
    delete family.continuationCursor;
    return JSON.stringify(stableRecord(family));
  } catch {
    return null;
  }
}

function maxOptionalNumber(left: number | undefined, right: number | undefined): number | undefined {
  if (left == null) return right;
  if (right == null) return left;
  return Math.max(left, right);
}

function mergeKnownRouteDiagnostics(
  base: RouteCatalogSearchMeta['knownRouteDiagnostics'],
  page: RouteCatalogSearchMeta['knownRouteDiagnostics'],
): RouteCatalogSearchMeta['knownRouteDiagnostics'] {
  const merged = new Map<string, Record<string, unknown>>();
  [...(base ?? []), ...(page ?? [])].forEach((diagnostic) => {
    merged.set(JSON.stringify(stableRecord(diagnostic)), diagnostic);
  });
  return merged.size > 0 ? Array.from(merged.values()) : undefined;
}

function mergeRouteCatalogSearchMeta(
  base: RouteCatalogSearchMeta | null,
  page: RouteCatalogSearchMeta | null,
): RouteCatalogSearchMeta | null {
  if (!base) return page ? { ...page } : null;
  if (!page) return { ...base };
  return {
    ecsRequestId: page.ecsRequestId ?? base.ecsRequestId,
    paginationContractVersion: page.paginationContractVersion ?? base.paginationContractVersion,
    nearbyRouteRpcUsed: page.nearbyRouteRpcUsed ?? base.nearbyRouteRpcUsed,
    nearbyRouteRpc: page.nearbyRouteRpc ?? base.nearbyRouteRpc,
    fallbackQueryUsed: page.fallbackQueryUsed ?? base.fallbackQueryUsed,
    candidateCount: Math.max(base.candidateCount, page.candidateCount),
    radiusMatchedCount: Math.max(base.radiusMatchedCount, page.radiusMatchedCount),
    geometryMatchedCount: maxOptionalNumber(base.geometryMatchedCount, page.geometryMatchedCount),
    trailheadMatchedCount: maxOptionalNumber(base.trailheadMatchedCount, page.trailheadMatchedCount),
    centerMatchedCount: maxOptionalNumber(base.centerMatchedCount, page.centerMatchedCount),
    aliasMatchedCount: maxOptionalNumber(base.aliasMatchedCount, page.aliasMatchedCount),
    featuredMatchedCount: maxOptionalNumber(base.featuredMatchedCount, page.featuredMatchedCount),
    curationCandidateCount: Math.max(base.curationCandidateCount, page.curationCandidateCount),
    anySourceBackedCandidateCount: Math.max(
      base.anySourceBackedCandidateCount,
      page.anySourceBackedCandidateCount,
    ),
    radiusFilterApplied: base.radiusFilterApplied || page.radiusFilterApplied,
    page: page.page,
    pageSize: page.pageSize,
    offset: page.offset,
    hasMore: page.hasMore,
    nextPage: page.nextPage,
    nextCursor: page.nextCursor ?? null,
    totalMatchedCount: Math.max(base.totalMatchedCount, page.totalMatchedCount),
    totalMatchedCountBounded: page.totalMatchedCountBounded,
    resultLimit: normalizeRouteSearchPageSize(page.resultLimit ?? base.resultLimit),
    additionalMatchesAvailable:
      page.additionalMatchesAvailable === true ||
      page.hasMore === true,
    paginationWarning: page.paginationWarning ?? base.paginationWarning ?? null,
    clientInvalidRecordCount:
      (base.clientInvalidRecordCount ?? 0) + (page.clientInvalidRecordCount ?? 0),
    knownRouteDiagnostics: mergeKnownRouteDiagnostics(
      base.knownRouteDiagnostics,
      page.knownRouteDiagnostics,
    ),
  };
}

function cloneLiveTrailPackCatalogSnapshot(
  value: LiveTrailPackCatalogSnapshot,
): LiveTrailPackCatalogSnapshot {
  const data = value.asyncState.data
    ? mergeLiveTrailPackCatalogData(null, value.asyncState.data)
    : null;
  const lastGoodData = value.asyncState.lastGoodData
    ? mergeLiveTrailPackCatalogData(null, value.asyncState.lastGoodData)
    : null;
  return {
    ...value,
    trailPacks: [...value.trailPacks],
    guidanceDiagnosticTrailPacks: [...value.guidanceDiagnosticTrailPacks],
    guidanceDiagnosticRecords: [...value.guidanceDiagnosticRecords],
    routeCatalogSummaries: [...value.routeCatalogSummaries],
    searchMeta: value.searchMeta ? { ...value.searchMeta } : null,
    asyncState: {
      ...value.asyncState,
      data,
      lastGoodData,
    },
  };
}

export function scopeLiveTrailPackCatalogSnapshotToAccessContext(
  value: LiveTrailPackCatalogSnapshot,
  accessContextPartition: unknown,
): LiveTrailPackCatalogSnapshot {
  const expectedPartition = normalizeExploreAccessContextPartition(accessContextPartition);
  if (value.accessContextPartition !== expectedPartition) {
    return emptyLiveTrailPackCatalogSnapshot(expectedPartition);
  }
  return cloneLiveTrailPackCatalogSnapshot(value);
}

export function mergeLiveTrailPackCatalogPageSnapshots(
  baseSnapshot: LiveTrailPackCatalogSnapshot,
  pageSnapshot: LiveTrailPackCatalogSnapshot,
  baseRefreshKey: string,
): LiveTrailPackCatalogSnapshot {
  const expectedFamily = routeCatalogRefreshFamilyKey(baseRefreshKey);
  const baseFamily = routeCatalogRefreshFamilyKey(baseSnapshot.refreshKey);
  const pageFamily = routeCatalogRefreshFamilyKey(pageSnapshot.refreshKey);
  const expectedAccessContextPartition = normalizeExploreAccessContextPartition(
    baseSnapshot.accessContextPartition,
  );
  const pageIsTerminal =
    pageSnapshot.status === 'ready' ||
    pageSnapshot.status === 'empty' ||
    pageSnapshot.status === 'stale' ||
    pageSnapshot.status === 'degraded' ||
    pageSnapshot.status === 'error';
  if (
    !expectedFamily ||
    baseFamily !== expectedFamily ||
    pageFamily !== expectedFamily ||
    pageSnapshot.accessContextPartition !== expectedAccessContextPartition ||
    !pageIsTerminal
  ) {
    return cloneLiveTrailPackCatalogSnapshot(baseSnapshot);
  }

  const mergedData = mergeLiveTrailPackCatalogData(
    catalogDataFromSnapshot(baseSnapshot),
    catalogDataFromSnapshot(pageSnapshot),
  ) ?? {
    trailPacks: [],
    guidanceDiagnosticTrailPacks: [],
    guidanceDiagnosticRecords: [],
    routeCatalogSummaries: [],
  };
  const mergedAsyncData = mergeLiveTrailPackCatalogData(
    baseSnapshot.asyncState.data,
    pageSnapshot.asyncState.data,
  ) ?? mergedData;
  const mergedLastGoodData = mergeLiveTrailPackCatalogData(
    baseSnapshot.asyncState.lastGoodData,
    pageSnapshot.asyncState.lastGoodData,
  );
  const hasMergedData = catalogResultCount(mergedData) > 0;
  const pageFailed = pageSnapshot.status === 'error';
  const baseHasPersistentIssue =
    baseSnapshot.preservedReason !== 'pagination_page_unavailable' &&
    (baseSnapshot.status === 'degraded' || baseSnapshot.status === 'stale');
  const hasDegradedPage =
    (baseHasPersistentIssue && baseSnapshot.status === 'degraded') || pageSnapshot.status === 'degraded';
  const hasStalePage =
    (baseHasPersistentIssue && baseSnapshot.status === 'stale') || pageSnapshot.status === 'stale';
  const noPaginationProgress =
    !pageFailed &&
    (pageSnapshot.searchMeta?.page ?? 1) > 1 &&
    pageSnapshot.searchMeta?.hasMore === true &&
    catalogUniqueRouteCount(mergedData) <= catalogUniqueRouteCount(catalogDataFromSnapshot(baseSnapshot));
  const mergedStatus: LiveTrailPackCatalogStatus = pageFailed && hasMergedData
    ? 'degraded'
    : hasDegradedPage
      ? 'degraded'
      : hasStalePage
        ? 'stale'
        : pageSnapshot.status === 'empty' && hasMergedData
          ? 'ready'
          : pageSnapshot.status;
  const status: LiveTrailPackCatalogStatus = noPaginationProgress && hasMergedData
    ? 'degraded'
    : mergedStatus;
  const mergedSearchMeta = mergeRouteCatalogSearchMeta(baseSnapshot.searchMeta, pageSnapshot.searchMeta);
  const searchMeta = noPaginationProgress && mergedSearchMeta
    ? {
        ...mergedSearchMeta,
        hasMore: false,
        nextPage: null,
        nextCursor: null,
        additionalMatchesAvailable: false,
        paginationWarning: 'no_progress',
      }
    : mergedSearchMeta;
  if (noPaginationProgress) {
    logRouteCatalogVisibilityDiagnostic('pagination_no_progress', {
      safeErrorCode: 'ROUTE_CATALOG_PAGINATION_NO_PROGRESS',
      page: pageSnapshot.searchMeta?.page ?? null,
      loadedCatalogCount: catalogUniqueRouteCount(mergedData),
      totalMatchedCount: searchMeta?.totalMatchedCount ?? null,
    }, {
      fingerprint: `${baseRefreshKey}:pagination_no_progress`,
    });
  }
  const retainedBaseIssue = baseHasPersistentIssue;
  const error = noPaginationProgress
    ? 'Route catalog continuation returned no new unique routes. Continuation stopped to prevent a request loop.'
    : pageFailed || pageSnapshot.status === 'degraded' || pageSnapshot.status === 'stale'
    ? pageSnapshot.error ?? (retainedBaseIssue ? baseSnapshot.error : null)
    : retainedBaseIssue
      ? baseSnapshot.error
      : null;
  const safeErrorCode = noPaginationProgress
    ? 'ROUTE_CATALOG_PAGINATION_NO_PROGRESS'
    : pageFailed || pageSnapshot.status === 'degraded' || pageSnapshot.status === 'stale'
    ? pageSnapshot.asyncState.safeErrorCode ?? (retainedBaseIssue ? baseSnapshot.asyncState.safeErrorCode : null)
    : retainedBaseIssue
      ? baseSnapshot.asyncState.safeErrorCode
      : null;
  const retryEligible =
    (baseHasPersistentIssue && baseSnapshot.asyncState.retryEligible) ||
    pageSnapshot.asyncState.retryEligible ||
    pageFailed;
  const freshness = pageFailed && hasMergedData
    ? 'stale'
    : (baseHasPersistentIssue && baseSnapshot.asyncState.freshness === 'stale') ||
        pageSnapshot.asyncState.freshness === 'stale'
      ? 'stale'
      : (baseHasPersistentIssue && baseSnapshot.asyncState.freshness === 'recent') ||
          pageSnapshot.asyncState.freshness === 'recent'
        ? 'recent'
        : pageSnapshot.asyncState.freshness;
  const asyncSource = pageFailed && hasMergedData
    ? baseSnapshot.asyncState.source
    : pageSnapshot.asyncState.source === 'unavailable' && hasMergedData
      ? baseSnapshot.asyncState.source
      : pageSnapshot.asyncState.source;
  const coverageState = getRouteCatalogCoverageState(mergedData.trailPacks, {
    userHasCriteria: searchMeta?.radiusFilterApplied ?? true,
    lowerConfidenceCount:
      mergedData.guidanceDiagnosticTrailPacks.length + mergedData.guidanceDiagnosticRecords.length,
  });
  const effectiveLastGoodData = mergedLastGoodData ?? (hasMergedData ? mergedAsyncData : null);

  return {
    ...pageSnapshot,
    trailPacks: mergedData.trailPacks,
    guidanceDiagnosticTrailPacks: mergedData.guidanceDiagnosticTrailPacks,
    guidanceDiagnosticRecords: mergedData.guidanceDiagnosticRecords,
    routeCatalogSummaries: mergedData.routeCatalogSummaries,
    status,
    error,
    lastLoadedAt: pageFailed
      ? baseSnapshot.lastLoadedAt
      : pageSnapshot.lastLoadedAt ?? baseSnapshot.lastLoadedAt,
    coverageState,
    searchMeta,
    source: pageSnapshot.source === 'unavailable' ? baseSnapshot.source : pageSnapshot.source,
    refreshKey: baseRefreshKey,
    preservedFromEmptyRefresh: pageFailed
      ? hasMergedData
      : pageSnapshot.preservedFromEmptyRefresh ||
        (baseHasPersistentIssue && baseSnapshot.preservedFromEmptyRefresh),
    preservedReason: noPaginationProgress
      ? 'pagination_no_progress'
      : pageFailed && hasMergedData
      ? 'pagination_page_unavailable'
      : pageSnapshot.preservedReason ?? (baseHasPersistentIssue ? baseSnapshot.preservedReason : null),
    asyncState: {
      ...pageSnapshot.asyncState,
      status,
      data: mergedAsyncData,
      lastGoodData: effectiveLastGoodData,
      source: asyncSource,
      freshness,
      safeErrorCode,
      retryEligible,
      resultCount: catalogResultCount(mergedAsyncData),
    },
  };
}

type RouteCatalogDetailCollection = 'trailPacks' | 'guidanceDiagnosticTrailPacks';

type RouteCatalogDetailReconciliationTarget = {
  routeId: string;
  sourceVersion: string;
  refreshKey: string;
  refreshRequestSequence: number;
  collection: RouteCatalogDetailCollection;
};

function catalogTrailPackSourceVersion(trailPack: ECSTrailPack): string {
  return cleanText(trailPack.updatedAt) ?? 'current';
}

function currentCatalogTrailPack(routeId: string): ECSTrailPack | null {
  return snapshot.trailPacks.find((trailPack) => trailPack.id === routeId)
    ?? snapshot.guidanceDiagnosticTrailPacks.find((trailPack) => trailPack.id === routeId)
    ?? null;
}

function detailSourceVersion(
  trailPack: ECSTrailPack | string,
  options: LiveTrailPackCatalogRefreshOptions,
): string {
  const routeId = String(typeof trailPack === 'string' ? trailPack : trailPack.id).trim();
  return cleanText(options.sourceVersion)
    ?? (typeof trailPack === 'string' ? undefined : cleanText(trailPack.updatedAt))
    ?? (routeId ? cleanText(currentCatalogTrailPack(routeId)?.updatedAt) : undefined)
    ?? 'current';
}

function captureRouteCatalogDetailReconciliationTarget(
  routeId: string,
  sourceVersion: string,
): RouteCatalogDetailReconciliationTarget | null {
  if (
    snapshot.source !== 'route_catalog'
    || !snapshot.refreshKey
    || snapshot.status === 'disabled'
    || snapshot.status === 'cancelled'
    || snapshot.status === 'error'
  ) {
    return null;
  }

  const primary = snapshot.trailPacks.find((trailPack) => trailPack.id === routeId);
  const diagnostic = snapshot.guidanceDiagnosticTrailPacks.find((trailPack) => trailPack.id === routeId);
  const current = primary ?? diagnostic;
  if (!current || catalogTrailPackSourceVersion(current) !== sourceVersion) return null;

  return {
    routeId,
    sourceVersion,
    refreshKey: snapshot.refreshKey,
    refreshRequestSequence,
    collection: primary ? 'trailPacks' : 'guidanceDiagnosticTrailPacks',
  };
}

function routeCatalogVersionTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function catalogDetailForSafePresentation(detail: ECSTrailPack): ECSTrailPack {
  if (detail.source !== 'partner_source') return detail;
  return {
    ...detail,
    routeGeometry: undefined,
    routeGeometryMode: 'omitted',
    routeIntelligence: undefined,
  };
}

function reconcileRouteCatalogDetailCollections(
  data: Pick<LiveTrailPackCatalogData, 'trailPacks' | 'guidanceDiagnosticTrailPacks'>,
  target: RouteCatalogDetailReconciliationTarget,
  detail: ECSTrailPack,
  destination: RouteCatalogDetailCollection,
): Pick<LiveTrailPackCatalogData, 'trailPacks' | 'guidanceDiagnosticTrailPacks'> | null {
  const matching = [
    ...data.trailPacks.filter((trailPack) => trailPack.id === target.routeId),
    ...data.guidanceDiagnosticTrailPacks.filter((trailPack) => trailPack.id === target.routeId),
  ];
  if (
    matching.length === 0
    || matching.some((trailPack) => catalogTrailPackSourceVersion(trailPack) !== target.sourceVersion)
  ) {
    return null;
  }

  const currentDestination = data[destination].find((trailPack) => trailPack.id === target.routeId);
  const otherCollection: RouteCatalogDetailCollection = destination === 'trailPacks'
    ? 'guidanceDiagnosticTrailPacks'
    : 'trailPacks';
  if (
    currentDestination === detail
    && !data[otherCollection].some((trailPack) => trailPack.id === target.routeId)
  ) {
    return null;
  }

  const replaceOrAppend = (items: ECSTrailPack[]): ECSTrailPack[] => {
    let replaced = false;
    const next = items.map((trailPack) => {
      if (trailPack.id !== target.routeId) return trailPack;
      replaced = true;
      return detail;
    });
    return replaced ? next : [...next, detail];
  };

  return {
    trailPacks: destination === 'trailPacks'
      ? replaceOrAppend(data.trailPacks)
      : data.trailPacks.filter((trailPack) => trailPack.id !== target.routeId),
    guidanceDiagnosticTrailPacks: destination === 'guidanceDiagnosticTrailPacks'
      ? replaceOrAppend(data.guidanceDiagnosticTrailPacks)
      : data.guidanceDiagnosticTrailPacks.filter((trailPack) => trailPack.id !== target.routeId),
  };
}

function reconcileRouteCatalogDetailData(
  data: LiveTrailPackCatalogData | null,
  target: RouteCatalogDetailReconciliationTarget,
  detail: ECSTrailPack,
  destination: RouteCatalogDetailCollection,
): LiveTrailPackCatalogData | null {
  if (!data) return data;
  const reconciled = reconcileRouteCatalogDetailCollections(data, target, detail, destination);
  if (!reconciled) return data;
  return {
    ...data,
    ...reconciled,
  };
}

function reconcileRouteCatalogDetail(
  target: RouteCatalogDetailReconciliationTarget | null,
  normalizedDetail: ECSTrailPack,
): boolean {
  if (
    !target
    || normalizedDetail.id !== target.routeId
    || normalizedDetail.reviewStatus !== 'approved'
    || !normalizedDetail.catalogVerification
    || snapshot.source !== 'route_catalog'
    || snapshot.refreshKey !== target.refreshKey
    || refreshRequestSequence !== target.refreshRequestSequence
  ) {
    return false;
  }

  const currentCollection = snapshot[target.collection];
  const current = currentCollection.find((trailPack) => trailPack.id === target.routeId);
  if (!current || catalogTrailPackSourceVersion(current) !== target.sourceVersion) return false;

  const currentTimestamp = routeCatalogVersionTimestamp(current.updatedAt);
  const incomingTimestamp = routeCatalogVersionTimestamp(normalizedDetail.updatedAt);
  if (currentTimestamp != null && incomingTimestamp != null && incomingTimestamp < currentTimestamp) {
    return false;
  }

  const detail = catalogDetailForSafePresentation(normalizedDetail);
  const destination: RouteCatalogDetailCollection =
    normalizedDetail.source !== 'partner_source'
    && normalizedDetail.catalogVerification.publicRecommendation
      ? 'trailPacks'
      : 'guidanceDiagnosticTrailPacks';
  const reconciled = reconcileRouteCatalogDetailCollections(snapshot, target, detail, destination);
  if (!reconciled) return false;

  setSnapshot({
    ...snapshot,
    ...reconciled,
    asyncState: {
      ...snapshot.asyncState,
      data: reconcileRouteCatalogDetailData(snapshot.asyncState.data, target, detail, destination),
      lastGoodData: reconcileRouteCatalogDetailData(
        snapshot.asyncState.lastGoodData,
        target,
        detail,
        destination,
      ),
    },
  });
  return true;
}

function routeCatalogDetailKey(routeId: string, sourceVersion: string): string {
  return JSON.stringify([routeId, sourceVersion]);
}

function currentRouteCatalogDetailGeneration(routeId: string): number {
  return routeCatalogDetailGenerations.get(routeId) ?? 0;
}

function catalogDataFromSnapshot(value: LiveTrailPackCatalogSnapshot): LiveTrailPackCatalogData {
  return {
    trailPacks: [...value.trailPacks],
    guidanceDiagnosticTrailPacks: [...value.guidanceDiagnosticTrailPacks],
    guidanceDiagnosticRecords: [...value.guidanceDiagnosticRecords],
    routeCatalogSummaries: [...value.routeCatalogSummaries],
  };
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : undefined;
}

function routeCatalogSearchLimit(value: unknown): number {
  return normalizeRouteSearchPageSize(value);
}

function routeCatalogSearchPage(value: unknown): number {
  const page = finiteNumber(value);
  if (page == null || page < 1) return 1;
  return Math.max(1, Math.min(10_000, Math.floor(page)));
}

function hasRouteCatalogRadiusCriteria(criteria: LiveTrailPackCatalogSearchCriteria): boolean {
  return (
    finiteNumber(criteria.latitude) != null &&
    finiteNumber(criteria.longitude) != null &&
    finiteNumber(criteria.radiusMiles) != null
  );
}

function stagedRouteCatalogSearchCriteria(
  criteria: LiveTrailPackCatalogSearchCriteria,
): LiveTrailPackCatalogSearchCriteria | null {
  void criteria;
  return null;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const ROUTE_CATALOG_VEHICLE_CLASS_ALIASES: Record<string, string> = {
  highway_legal_4x4: 'highway_legal_4x4',
  full_size_4x4: 'full_size_4x4',
  fullsize_4x4: 'full_size_4x4',
  stock_suv: 'highway_legal_4x4',
  built_4x4: 'highway_legal_4x4',
  expedition_rig: 'highway_legal_4x4',
  overland: 'highway_legal_4x4',
  truck: 'full_size_4x4',
  pickup: 'full_size_4x4',
  full_size_truck: 'full_size_4x4',
  fullsize_truck: 'full_size_4x4',
  midsize_truck: 'highway_legal_4x4',
  mid_size_truck: 'highway_legal_4x4',
  suv: 'highway_legal_4x4',
  suv_van: 'highway_legal_4x4',
  jeep: 'highway_legal_4x4',
  motorcycle: 'motorcycle',
  dirt_bike: 'motorcycle',
  dual_sport: 'motorcycle',
  atv: 'atv',
  quad: 'atv',
  utv: 'utv',
  sxs: 'utv',
  side_by_side: 'utv',
};

export function resolveRouteCatalogVehicleClass(value: unknown): string | undefined {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;

  const normalized = cleaned
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return ROUTE_CATALOG_VEHICLE_CLASS_ALIASES[normalized];
}

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

function catalogSourceType(pack: ECSTrailPack): RouteCatalogSourceType {
  if (pack.dataState === 'fixture') return 'preview';
  if (pack.source === 'community_reviewed' || pack.source === 'ecs_submitted') return 'community';
  if (pack.source === 'imported_gpx' || pack.source === 'imported_kml') return 'imported';
  if (pack.source === 'needs_review') return 'preview';
  return 'official';
}

function finiteMetersFromMiles(value: unknown): number | null {
  const miles = Number(value);
  return Number.isFinite(miles) && miles >= 0 ? Math.round(miles * 1609.344) : null;
}

function finiteSecondsFromMinutes(value: unknown): number | null {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 60) : null;
}

function pointBbox(coordinate: ECSTrailPackCoordinate) {
  return {
    minLng: coordinate.longitude,
    minLat: coordinate.latitude,
    maxLng: coordinate.longitude,
    maxLat: coordinate.latitude,
  };
}

function distanceMilesBetweenCoordinates(
  a: ECSTrailPackCoordinate,
  b: ECSTrailPackCoordinate,
): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function legacyTrailPackMatchesCriteria(
  pack: ECSTrailPack,
  criteria: LiveTrailPackCatalogSearchCriteria,
): boolean {
  if (pack.source === 'partner_source') return false;
  const latitude = finiteNumber(criteria.latitude);
  const longitude = finiteNumber(criteria.longitude);
  const radiusMiles = positiveNumber(criteria.radiusMiles);
  if (latitude != null && longitude != null && radiusMiles != null) {
    const distanceMiles = distanceMilesBetweenCoordinates(
      { latitude, longitude },
      pack.centerCoordinate,
    );
    if (distanceMiles > radiusMiles) return false;
  }

  const routeType = cleanText(criteria.routeType)?.toLowerCase();
  if (routeType && pack.routeType !== routeType) return false;
  const difficulty = cleanText(criteria.difficulty)?.toLowerCase();
  if (difficulty && pack.difficulty !== difficulty) return false;
  const exploreRefinement = cleanText(criteria.exploreRefinement) as ExploreRefinementFilter | undefined;
  if (
    exploreRefinement &&
    ['remoteness', 'dayTrip', 'weekendTrip', 'expedition'].includes(exploreRefinement) &&
    !trailMatchesExploreRefinement(pack, exploreRefinement)
  ) return false;

  const minDistanceMiles = finiteNumber(criteria.minDistanceMiles);
  if (minDistanceMiles != null && (pack.distanceMiles == null || pack.distanceMiles < minDistanceMiles)) return false;
  const maxDistanceMiles = finiteNumber(criteria.maxDistanceMiles);
  if (maxDistanceMiles != null && (pack.distanceMiles == null || pack.distanceMiles > maxDistanceMiles)) return false;
  const minDurationMinutes = finiteNumber(criteria.minDurationMinutes);
  if (
    minDurationMinutes != null
    && (pack.estimatedDurationMinutes == null || pack.estimatedDurationMinutes < minDurationMinutes)
  ) return false;
  const maxDurationMinutes = finiteNumber(criteria.maxDurationMinutes);
  if (
    maxDurationMinutes != null
    && (pack.estimatedDurationMinutes == null || pack.estimatedDurationMinutes > maxDurationMinutes)
  ) return false;

  const minConfidenceScore = finiteNumber(criteria.minConfidenceScore);
  if (minConfidenceScore != null && pack.confidenceScore < minConfidenceScore) return false;
  const minRemotenessScore = finiteNumber(criteria.minRemotenessScore);
  if (minRemotenessScore != null && (pack.remotenessScore == null || pack.remotenessScore < minRemotenessScore)) {
    return false;
  }
  const maxRemotenessScore = finiteNumber(criteria.maxRemotenessScore);
  if (maxRemotenessScore != null && (pack.remotenessScore == null || pack.remotenessScore > maxRemotenessScore)) {
    return false;
  }
  const minCampabilityScore = finiteNumber(criteria.minCampabilityScore);
  if (minCampabilityScore != null && (pack.campabilityScore == null || pack.campabilityScore < minCampabilityScore)) {
    return false;
  }

  const vehicleClass = resolveRouteCatalogVehicleClass(criteria.vehicleClass);
  if (vehicleClass && pack.vehicleFit?.length) {
    const compatible = pack.vehicleFit.some((value) => {
      const normalized = resolveRouteCatalogVehicleClass(value) ?? cleanText(value)?.toLowerCase();
      return normalized === vehicleClass || normalized === 'any' || normalized === 'all';
    });
    if (!compatible) return false;
  }

  const fuelRangeMiles = finiteNumber(criteria.availableFuelRangeMiles);
  if (
    fuelRangeMiles != null
    && pack.minimumFuelRangeMiles != null
    && pack.minimumFuelRangeMiles > fuelRangeMiles
  ) return false;
  const waterCapacityGallons = finiteNumber(criteria.availableWaterCapacityGallons);
  if (
    waterCapacityGallons != null
    && pack.minimumWaterCapacityGallons != null
    && pack.minimumWaterCapacityGallons > waterCapacityGallons
  ) return false;
  return true;
}

function compareLegacyTrailPacksForSearch(
  left: ECSTrailPack,
  right: ECSTrailPack,
  criteria: LiveTrailPackCatalogSearchCriteria,
): number {
  const featuredDelta = (right.featuredRouteScore ?? 0) - (left.featuredRouteScore ?? 0);
  if (featuredDelta !== 0) return featuredDelta;
  const latitude = finiteNumber(criteria.latitude);
  const longitude = finiteNumber(criteria.longitude);
  if (latitude != null && longitude != null) {
    const center = { latitude, longitude };
    const distanceDelta =
      distanceMilesBetweenCoordinates(center, left.centerCoordinate) -
      distanceMilesBetweenCoordinates(center, right.centerCoordinate);
    if (distanceDelta !== 0) return distanceDelta;
  }
  const confidenceDelta = right.confidenceScore - left.confidenceScore;
  if (confidenceDelta !== 0) return confidenceDelta;
  const qualityDelta =
    ((right.campabilityScore ?? 0) + (right.remotenessScore ?? 0)) -
    ((left.campabilityScore ?? 0) + (left.remotenessScore ?? 0));
  if (qualityDelta !== 0) return qualityDelta;
  const parsedLeftUpdatedAt = Date.parse(left.updatedAt);
  const parsedRightUpdatedAt = Date.parse(right.updatedAt);
  const leftUpdatedAt = Number.isFinite(parsedLeftUpdatedAt) ? parsedLeftUpdatedAt : 0;
  const rightUpdatedAt = Number.isFinite(parsedRightUpdatedAt) ? parsedRightUpdatedAt : 0;
  const updatedAtDelta = rightUpdatedAt - leftUpdatedAt;
  if (updatedAtDelta !== 0) return updatedAtDelta;
  return left.id.localeCompare(right.id);
}

function trailPackToRouteCatalogSummary(pack: ECSTrailPack): RouteCatalogSummary | null {
  const positiveFeedbackCount = pack.positiveFeedbackCount ?? 0;
  const negativeFeedbackCount = pack.negativeFeedbackCount ?? 0;
  return normalizeRouteCatalogSummary({
    routeId: pack.id,
    title: pack.name,
    region: pack.routeIntelligence?.region ?? null,
    forestName: pack.routeIntelligence?.forestName ?? pack.routeIntelligence?.forest ?? null,
    distanceMeters: finiteMetersFromMiles(pack.distanceMiles),
    estimatedDurationSeconds: finiteSecondsFromMinutes(pack.estimatedDurationMinutes),
    difficulty: pack.difficulty ?? null,
    popularityScore: pack.completionCount ?? null,
    communityRating:
      positiveFeedbackCount || negativeFeedbackCount
        ? positiveFeedbackCount / Math.max(1, positiveFeedbackCount + negativeFeedbackCount)
        : null,
    sourceType: catalogSourceType(pack),
    bbox: pointBbox(pack.centerCoordinate),
    trailheadCoordinate: pack.centerCoordinate,
    thumbnailUrl: null,
    thumbnailAssetKey: pack.tags?.find((tag) => tag.startsWith('thumbnail:'))?.slice('thumbnail:'.length) ?? null,
    updatedAt: pack.updatedAt,
    tags: pack.tags ?? [],
  });
}

function routeCatalogSummariesFromTrailPacks(trailPacks: ECSTrailPack[]): RouteCatalogSummary[] {
  return trailPacks
    .map(trailPackToRouteCatalogSummary)
    .filter((summary): summary is RouteCatalogSummary => !!summary);
}

function guidanceDiagnosticTrailPacksFromRouteCatalog(records: RouteCatalogRecord[]): ECSTrailPack[] {
  return records.flatMap((route) => {
    const verification = verifyRouteCatalogRecord(route);
    if (verification.publicRecommendation) return [];
    const trailPack = catalogRouteToTrailPack(route, verification);
    const hasRestrictedPartnerSource = route.sourceRecords.some(
      (source) => source.sourceType === 'partner_restricted',
    );
    if (!hasRestrictedPartnerSource) return [trailPack];
    return [{
      ...trailPack,
      routeGeometry: undefined,
      routeGeometryMode: 'omitted',
      routeIntelligence: undefined,
    }];
  });
}

type RouteCatalogSummaryCachePayload = {
  summaries: RouteCatalogSummary[];
  cachedAt: string;
  coverageState: RouteCatalogCoverageState;
  searchMeta: RouteCatalogSearchMeta | null;
  source: LiveTrailPackCatalogSnapshot['source'];
  accessContextPartition: string;
  refreshKey: string;
};

export function routeCatalogSummaryCacheKeys(criteria: LiveTrailPackCatalogSearchCriteria): string[] {
  const accessContextPartition = normalizeExploreAccessContextPartition(
    criteria.accessContextPartition,
  );
  const keys = [exploreCatalogAccessCacheKey(
    EXPLORE_CATALOG_SUMMARY_CACHE_KEY,
    accessContextPartition,
  )];
  const regionId = cleanText(criteria.regionId ?? criteria.locationSource);
  if (regionId) {
    keys.push(exploreCatalogAccessCacheKey(
      exploreCatalogRegionCacheKey(regionId),
      accessContextPartition,
    ));
  }
  return Array.from(new Set(keys));
}

function parseRouteCatalogSummaryCachePayload(
  raw: string | null,
  expectedAccessContextPartition: string,
  nowMs = Date.now(),
): RouteCatalogSummaryCachePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const record = readRecord(parsed);
    if (!record) return null;
    const accessContextPartition = cleanText(record.accessContextPartition);
    if (
      !accessContextPartition ||
      normalizeExploreAccessContextPartition(accessContextPartition) !== expectedAccessContextPartition
    ) {
      return null;
    }
    const cachedAt = cleanText(record.cachedAt);
    if (!cachedAt) return null;
    const cachedAtMs = Date.parse(cachedAt);
    if (!Number.isFinite(cachedAtMs)) return null;
    if (nowMs - cachedAtMs > EXPLORE_CATALOG_SUMMARY_CACHE_TTL_MS + EXPLORE_CATALOG_SUMMARY_CACHE_STALE_MS) {
      return null;
    }
    const summaries = Array.isArray(record.summaries)
      ? dedupeUniqueRankedRoutes(record.summaries
          .map(normalizeRouteCatalogSummary)
          .filter((summary): summary is RouteCatalogSummary => !!summary),
          (summary) => summary.routeId)
      : [];
    if (summaries.length === 0) return null;
    const coverageStateRecord = readRecord(record.coverageState);
    const searchMetaRecord = readRecord(record.searchMeta);
    return {
      summaries,
      cachedAt,
      coverageState:
        coverageStateRecord && typeof coverageStateRecord.state === 'string'
          ? coverageStateRecord as unknown as RouteCatalogCoverageState
          : getRouteCatalogCoverageState([], { userHasCriteria: true }),
      searchMeta: searchMetaRecord as unknown as RouteCatalogSearchMeta | null,
      source: record.source === 'trail_packs_fallback' ? 'trail_packs_fallback' : 'route_catalog',
      accessContextPartition,
      refreshKey: cleanText(record.refreshKey) ?? '',
    };
  } catch {
    return null;
  }
}

async function readCachedRouteCatalogSummarySnapshot(
  criteria: LiveTrailPackCatalogSearchCriteria,
  refreshKey: string,
): Promise<LiveTrailPackCatalogSnapshot | null> {
  await routeCatalogSummaryPersistentCache.waitForHydration();
  const accessContextPartition = normalizeExploreAccessContextPartition(
    criteria.accessContextPartition,
  );
  for (const key of routeCatalogSummaryCacheKeys(criteria)) {
    const cached = parseRouteCatalogSummaryCachePayload(
      routeCatalogSummaryPersistentCache.get(key),
      accessContextPartition,
    );
    if (!cached || cached.refreshKey !== refreshKey) continue;
    return {
      trailPacks: [],
      guidanceDiagnosticTrailPacks: [],
      guidanceDiagnosticRecords: [],
      routeCatalogSummaries: cached.summaries,
      status: 'loading',
      error: null,
      lastLoadedAt: cached.cachedAt,
      lastRefreshAttemptAt: cached.cachedAt,
      coverageState: cached.coverageState,
      searchMeta: cached.searchMeta,
      ecsRequestId: cached.searchMeta?.ecsRequestId ?? null,
      ecsRequestKey: null,
      source: cached.source,
      accessContextPartition: cached.accessContextPartition,
      refreshKey,
      preservedFromEmptyRefresh: false,
      preservedReason: 'stale_summary_revalidate',
      asyncState: snapshot.asyncState,
    };
  }
  return null;
}

function writeRouteCatalogSummaryCache(
  criteria: LiveTrailPackCatalogSearchCriteria,
  nextSnapshot: LiveTrailPackCatalogSnapshot,
): void {
  if (
    (nextSnapshot.searchMeta?.page ?? 1) > 1 &&
    nextSnapshot.searchMeta?.hasMore === true
  ) {
    // Page-one remains the crash-safe checkpoint. Persist the full merged set
    // once at terminal instead of serializing an ever-growing array per page.
    return;
  }
  if (nextSnapshot.routeCatalogSummaries.length === 0) {
    if (
      (nextSnapshot.status === 'empty' || nextSnapshot.status === 'ready') &&
      nextSnapshot.source === 'route_catalog' &&
      nextSnapshot.refreshKey
    ) {
      let deletedMatchingEntry = false;
      routeCatalogSummaryCacheKeys(criteria).forEach((key) => {
        const raw = routeCatalogSummaryPersistentCache.get(key);
        if (!raw) return;
        try {
          const cached = readRecord(JSON.parse(raw));
          if (cleanText(cached?.refreshKey) !== nextSnapshot.refreshKey) return;
          routeCatalogSummaryPersistentCache.delete(key);
          deletedMatchingEntry = true;
        } catch {
          // Preserve malformed or unrelated entries; normal cache hydration already ignores them.
        }
      });
      if (deletedMatchingEntry) void routeCatalogSummaryPersistentCache.flush();
    }
    return;
  }
  const payload: RouteCatalogSummaryCachePayload = {
    summaries: dedupeUniqueRankedRoutes(
      nextSnapshot.routeCatalogSummaries,
      (summary) => summary.routeId,
    ),
    cachedAt: nextSnapshot.lastLoadedAt ?? new Date().toISOString(),
    coverageState: nextSnapshot.coverageState,
    searchMeta: nextSnapshot.searchMeta,
    source: nextSnapshot.source,
    accessContextPartition: normalizeExploreAccessContextPartition(
      nextSnapshot.accessContextPartition,
    ),
    refreshKey: nextSnapshot.refreshKey ?? createLiveTrailPackCatalogRefreshKey(criteria),
  };
  const serialized = JSON.stringify(payload);
  routeCatalogSummaryCacheKeys(criteria).forEach((key) => {
    routeCatalogSummaryPersistentCache.set(key, serialized);
  });
  void routeCatalogSummaryPersistentCache.flush();
}

function setSnapshot(next: LiveTrailPackCatalogSnapshot): LiveTrailPackCatalogSnapshot {
  const normalizedData = normalizeLiveTrailPackCatalogData(catalogDataFromSnapshot(next)) ?? {
    trailPacks: [],
    guidanceDiagnosticTrailPacks: [],
    guidanceDiagnosticRecords: [],
    routeCatalogSummaries: [],
  };
  snapshot = {
    ...next,
    ...normalizedData,
    accessContextPartition: normalizeExploreAccessContextPartition(next.accessContextPartition),
    asyncState: {
      ...next.asyncState,
      data: normalizeLiveTrailPackCatalogData(next.asyncState.data),
      lastGoodData: normalizeLiveTrailPackCatalogData(next.asyncState.lastGoodData),
      resultCount: next.asyncState.data
        ? catalogResultCount(normalizeLiveTrailPackCatalogData(next.asyncState.data) ?? normalizedData)
        : next.asyncState.resultCount,
    },
  };
  emit();
  return liveTrailPackCatalogStore.getSnapshot();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSource(value: unknown): ECSTrailPackSource {
  const source = String(value ?? '').trim();
  if (
    source === 'ecs_submitted' ||
    source === 'community_reviewed' ||
    source === 'ecs_validated' ||
    source === 'imported_gpx' ||
    source === 'imported_kml' ||
    source === 'partner_source' ||
    source === 'needs_review'
  ) {
    return source;
  }
  return 'needs_review';
}

function normalizeRouteType(value: unknown): ECSTrailPackRouteType {
  const routeType = String(value ?? '').trim();
  if (
    routeType === 'loop' ||
    routeType === 'out_and_back' ||
    routeType === 'point_to_point' ||
    routeType === 'area_pack' ||
    routeType === 'unknown'
  ) {
    return routeType;
  }
  return 'unknown';
}

function normalizeDifficulty(value: unknown): ECSTrailPackDifficulty {
  const difficulty = String(value ?? '').trim();
  if (
    difficulty === 'easy' ||
    difficulty === 'moderate' ||
    difficulty === 'technical' ||
    difficulty === 'extreme' ||
    difficulty === 'unknown'
  ) {
    return difficulty;
  }
  return 'unknown';
}

function normalizeReviewStatus(value: unknown): ECSTrailPackReviewStatus {
  const status = String(value ?? '').trim();
  if (
    status === 'draft' ||
    status === 'pending_review' ||
    status === 'approved' ||
    status === 'rejected' ||
    status === 'needs_more_data'
  ) {
    return status;
  }
  return 'needs_more_data';
}

function isCoordinate(value: unknown): value is ECSTrailPackCoordinate {
  const record = readRecord(value);
  if (!record) return false;
  const latitude = Number(record.latitude ?? record.lat);
  const longitude = Number(record.longitude ?? record.lng ?? record.lon);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function normalizeCoordinate(value: unknown): ECSTrailPackCoordinate | null {
  if (!isCoordinate(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    latitude: Number(record.latitude ?? record.lat),
    longitude: Number(record.longitude ?? record.lng ?? record.lon),
  };
}

function normalizeCoordinatePair(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    const elevationMeters = value.length > 2 ? Number(value[2]) : null;
    return elevationMeters != null && Number.isFinite(elevationMeters)
      ? [longitude, latitude, elevationMeters]
      : [longitude, latitude];
  }
  return null;
}

function normalizeGeometry(value: unknown): ECSTrailPackRouteGeometry | undefined {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      })()
    : value;
  const record = readRecord(parsed);
  if (!record) return undefined;

  if (record.type === 'LineString' && Array.isArray(record.coordinates)) {
    const coordinates = record.coordinates
      .map(normalizeCoordinatePair)
      .filter((point): point is number[] => !!point);
    return coordinates.length >= 2 ? { type: 'LineString', coordinates } : undefined;
  }

  if (record.type === 'MultiLineString' && Array.isArray(record.coordinates)) {
    const coordinates = record.coordinates
      .map((line) =>
        Array.isArray(line)
          ? line.map(normalizeCoordinatePair).filter((point): point is number[] => !!point)
          : [],
      )
      .filter((line) => line.length >= 2);
    return coordinates.length > 0 ? { type: 'MultiLineString', coordinates } : undefined;
  }

  return undefined;
}

function centerFromGeometry(geometry: ECSTrailPackRouteGeometry | undefined): ECSTrailPackCoordinate | null {
  if (!geometry) return null;
  const rawCoordinates = geometry.type === 'MultiLineString'
    ? (geometry.coordinates as number[][][]).flat()
    : (geometry.coordinates as number[][]);
  if (rawCoordinates.length === 0) return null;
  const totals = rawCoordinates.reduce(
    (acc, coordinate) => ({
      latitude: acc.latitude + Number(coordinate[1]),
      longitude: acc.longitude + Number(coordinate[0]),
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: totals.latitude / rawCoordinates.length,
    longitude: totals.longitude / rawCoordinates.length,
  };
}

export function normalizeLiveTrailPackRecord(value: unknown): ECSTrailPack | null {
  const record = readRecord(value);
  if (!record) return null;

  const id = readString(record, 'public_id', 'publicId', 'id');
  const name = readString(record, 'name', 'title');
  if (!id || !name) return null;

  const routeGeometry = normalizeGeometry(record.route_geometry ?? record.routeGeometry);
  const centerCoordinate =
    normalizeCoordinate(record.center_coordinate ?? record.centerCoordinate) ??
    (() => {
      const latitude = readNumber(record, 'center_latitude', 'centerLatitude', 'latitude', 'lat');
      const longitude = readNumber(record, 'center_longitude', 'centerLongitude', 'longitude', 'lng', 'lon');
      return latitude != null && longitude != null
        ? { latitude, longitude }
        : null;
    })() ??
    centerFromGeometry(routeGeometry);
  if (!centerCoordinate) return null;

  const confidenceScore = readNumber(record, 'confidence_score', 'confidenceScore') ?? 0;
  const positiveFeedbackCount = readNumber(record, 'positive_feedback_count', 'positiveFeedbackCount') ?? 0;
  const negativeFeedbackCount = readNumber(record, 'negative_feedback_count', 'negativeFeedbackCount') ?? 0;
  const completionCount = readNumber(record, 'completion_count', 'completionCount') ?? 0;
  const createdAt = readString(record, 'created_at', 'createdAt') ?? new Date(0).toISOString();
  const updatedAt = readString(record, 'updated_at', 'updatedAt') ?? createdAt;

  return {
    id,
    name,
    description: readString(record, 'description'),
    source: normalizeSource(record.source),
    dataState: 'live',
    routeType: normalizeRouteType(record.route_type ?? record.routeType),
    centerCoordinate,
    routeGeometry,
    distanceMiles: readNumber(record, 'distance_miles', 'distanceMiles'),
    estimatedDurationMinutes: readNumber(record, 'estimated_duration_minutes', 'estimatedDurationMinutes'),
    difficulty: normalizeDifficulty(record.difficulty),
    vehicleFit: readStringArray(record.vehicle_fit ?? record.vehicleFit),
    remotenessScore: readNumber(record, 'remoteness_score', 'remotenessScore'),
    campabilityScore: readNumber(record, 'campability_score', 'campabilityScore'),
    minimumFuelRangeMiles: readNumber(
      record,
      'minimum_fuel_range_miles',
      'minimumFuelRangeMiles',
      'minFuelRangeMiles',
    ),
    minimumWaterCapacityGallons: readNumber(
      record,
      'minimum_water_capacity_gallons',
      'minimumWaterCapacityGallons',
      'minWaterCapacityGallons',
    ),
    routeIntelligence: readRecord(record.route_intelligence ?? record.routeIntelligence) ?? undefined,
    searchDistanceMiles: readNumber(record, 'search_distance_miles', 'searchDistanceMiles'),
    geometryDistanceMiles: readNumber(record, 'geometry_distance_miles', 'geometryDistanceMiles'),
    trailheadDistanceMiles: readNumber(record, 'trailhead_distance_miles', 'trailheadDistanceMiles'),
    centerDistanceMiles: readNumber(record, 'center_distance_miles', 'centerDistanceMiles'),
    searchMatchReasons: readStringArray(record.search_match_reasons ?? record.searchMatchReasons),
    featuredRouteScore: readNumber(record, 'featured_route_score', 'featuredRouteScore'),
    confidenceScore,
    confidenceReasons: readStringArray(record.confidence_reasons ?? record.confidenceReasons) ?? [
      'Loaded from the live ECS Trail Pack catalog.',
    ],
    lastVerifiedAt: readString(record, 'last_verified_at', 'lastVerifiedAt'),
    positiveFeedbackCount,
    negativeFeedbackCount,
    completionCount,
    reviewStatus: normalizeReviewStatus(record.review_status ?? record.reviewStatus),
    tags: readStringArray(record.tags),
    createdAt,
    updatedAt,
  };
}

export function normalizeLiveTrailPackRecords(records: unknown): ECSTrailPack[] {
  if (!Array.isArray(records)) return [];
  return records
    .map(normalizeLiveTrailPackRecord)
    .filter((pack): pack is ECSTrailPack => !!pack && pack.dataState === 'live' && pack.reviewStatus === 'approved');
}

export function buildRouteCatalogSearchBody(
  criteria: LiveTrailPackCatalogSearchCriteria = {},
): Record<string, unknown> {
  const latitude = finiteNumber(criteria.latitude);
  const longitude = finiteNumber(criteria.longitude);
  const radiusMiles = finiteNumber(criteria.radiusMiles);
  const vehicleClass = resolveRouteCatalogVehicleClass(criteria.vehicleClass);
  const minDistanceMiles = finiteNumber(criteria.minDistanceMiles);
  const maxDistanceMiles = finiteNumber(criteria.maxDistanceMiles);
  const minDurationMinutes = finiteNumber(criteria.minDurationMinutes);
  const maxDurationMinutes = finiteNumber(criteria.maxDurationMinutes);
  const minConfidenceScore = finiteNumber(criteria.minConfidenceScore);
  const minRemotenessScore = finiteNumber(criteria.minRemotenessScore);
  const maxRemotenessScore = finiteNumber(criteria.maxRemotenessScore);
  const minCampabilityScore = finiteNumber(criteria.minCampabilityScore);
  const availableFuelRangeMiles = positiveNumber(criteria.availableFuelRangeMiles);
  const availableWaterCapacityGallons = positiveNumber(criteria.availableWaterCapacityGallons);
  const routeType = cleanText(criteria.routeType);
  const difficulty = cleanText(criteria.difficulty);
  const regionId = cleanText(criteria.regionId);
  const searchFingerprint = cleanText(criteria.searchFingerprint);
  const exploreRefinement = cleanText(criteria.exploreRefinement);
  const includePreviewGeometry = criteria.includePreviewGeometry === true;
  const pageSize = routeCatalogSearchLimit(
    criteria.pageSize ?? criteria.limit ?? ROUTE_CATALOG_SUMMARY_PAGE_SIZE,
  );
  const page = routeCatalogSearchPage(criteria.page);
  const offset = (page - 1) * pageSize;
  const continuationCursor = cleanText(criteria.continuationCursor);
  return {
    limit: pageSize,
    page,
    pageSize,
    offset,
    ...(continuationCursor ? { continuationCursor } : {}),
    paginationContractVersion: ROUTE_CATALOG_PAGINATION_CONTRACT_VERSION,
    includeGeometry: false,
    includePreviewGeometry,
    includeAssessment: true,
    recommendationOnly: true,
    expectedKnownRoutes: criteria.expectedKnownRoutes ?? ['rubicon'],
    ...(criteria.includeCoverageDiagnostics === false ? { includeCoverageDiagnostics: false } : {}),
    ...(latitude != null && longitude != null && radiusMiles != null
      ? {
          latitude: criteria.latitude,
          longitude: criteria.longitude,
          radiusMiles: criteria.radiusMiles,
        }
      : {}),
    ...(vehicleClass ? { vehicleClass } : {}),
    ...(minDistanceMiles != null ? { minDistanceMiles: criteria.minDistanceMiles } : {}),
    ...(maxDistanceMiles != null ? { maxDistanceMiles: criteria.maxDistanceMiles } : {}),
    ...(minDurationMinutes != null ? { minDurationMinutes: criteria.minDurationMinutes } : {}),
    ...(maxDurationMinutes != null ? { maxDurationMinutes: criteria.maxDurationMinutes } : {}),
    ...(routeType ? { routeType: criteria.routeType } : {}),
    ...(difficulty ? { difficulty: criteria.difficulty } : {}),
    ...(regionId ? { regionId: criteria.regionId } : {}),
    ...(searchFingerprint ? { searchFingerprint } : {}),
    ...(exploreRefinement ? { exploreRefinement } : {}),
    ...(minConfidenceScore != null ? { minConfidenceScore: criteria.minConfidenceScore } : {}),
    ...(minRemotenessScore != null ? { minRemotenessScore: criteria.minRemotenessScore } : {}),
    ...(maxRemotenessScore != null ? { maxRemotenessScore: criteria.maxRemotenessScore } : {}),
    ...(minCampabilityScore != null ? { minCampabilityScore: criteria.minCampabilityScore } : {}),
    ...(availableFuelRangeMiles != null ? { availableFuelRangeMiles: criteria.availableFuelRangeMiles } : {}),
    ...(availableWaterCapacityGallons != null
      ? { availableWaterCapacityGallons: criteria.availableWaterCapacityGallons }
      : {}),
    ...(typeof criteria.locationSource === 'string' && criteria.locationSource.trim().length > 0
      ? { locationSource: criteria.locationSource }
      : {}),
  };
}

function stableRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const entry = value[key];
      acc[key] = Array.isArray(entry) ? [...entry].sort() : entry;
      return acc;
    }, {});
}

function requireRouteCatalogSearchRecords(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const response = readRecord(value);
  if (!response) throw new InvalidRouteCatalogSearchResponseError();
  if (Array.isArray(response.records)) return response.records;
  if (Array.isArray(response.routes)) return response.routes;
  throw new InvalidRouteCatalogSearchResponseError();
}

function normalizeRouteCatalogSafeDiagnostic(value: unknown): LiveTrailPackCatalogSafeDiagnostic | null {
  const record = readRecord(value);
  if (!record) return null;
  const routeId = readString(record, 'routeId', 'route_id');
  const exclusionReasons = readStringArray(record.exclusionReasons ?? record.exclusion_reasons) ?? [];
  if (!routeId || exclusionReasons.length === 0) return null;
  return {
    routeId,
    publicId: readString(record, 'publicId', 'public_id') ?? null,
    name: readString(record, 'name', 'title') ?? null,
    exclusionReasons,
    sourceTypes: readStringArray(record.sourceTypes ?? record.source_types) ?? [],
    reviewStatus: readString(record, 'reviewStatus', 'review_status') ?? null,
    recommendationStatus: readString(record, 'recommendationStatus', 'recommendation_status') ?? null,
    updatedAt: readString(record, 'updatedAt', 'updated_at') ?? null,
  };
}

function readRouteCatalogSafeDiagnostics(value: unknown): LiveTrailPackCatalogSafeDiagnostic[] {
  const response = readRecord(value);
  const rawDiagnostics = response?.diagnosticRecords ?? response?.diagnostic_records;
  if (rawDiagnostics == null) return [];
  if (!Array.isArray(rawDiagnostics)) throw new InvalidRouteCatalogSearchResponseError();
  return rawDiagnostics
    .map(normalizeRouteCatalogSafeDiagnostic)
    .filter((diagnostic): diagnostic is LiveTrailPackCatalogSafeDiagnostic => !!diagnostic);
}

export function createLiveTrailPackCatalogRefreshKey(
  criteria: LiveTrailPackCatalogSearchCriteria = {},
): string {
  return JSON.stringify(stableRecord({
    ...buildRouteCatalogSearchBody(criteria),
    accessContextPartition: normalizeExploreAccessContextPartition(
      criteria.accessContextPartition,
    ),
  }));
}

type RouteCatalogNetworkRequestOptions = LiveTrailPackCatalogRefreshOptions & {
  ecsRequestId?: string | null;
  onEcsRequestId?: (requestId: string, requestKey: string) => void;
};

async function fetchRouteCatalogTrailPacks(
  criteria: LiveTrailPackCatalogSearchCriteria = {},
  options: RouteCatalogNetworkRequestOptions = {},
): Promise<{
  trailPacks: ECSTrailPack[];
  guidanceDiagnosticTrailPacks: ECSTrailPack[];
  guidanceDiagnosticRecords: LiveTrailPackCatalogSafeDiagnostic[];
  coverageState: RouteCatalogCoverageState;
  searchMeta: RouteCatalogSearchMeta;
}> {
  const startedAtMs = getExplorePerformanceNow();
  const requestKey = createLiveTrailPackCatalogRefreshKey(criteria);
  const sentRequestId = normalizeECSRouteCatalogRequestId(options.ecsRequestId)
    ?? createECSRouteCatalogRequestId();
  options.onEcsRequestId?.(sentRequestId, requestKey);
  logRouteCatalogClientCorrelationDiagnostic({
    event: 'client_request_start',
    requestId: sentRequestId,
    status: 'network',
  });
  const perfRun = createExplorePerformanceRun({
    flow: 'route_catalog_refresh',
    searchKey: createECSAsyncRequestFingerprint(createLiveTrailPackCatalogRefreshKey(criteria)),
    startedAtMs,
    metadata: {
      radiusMiles: criteria.radiusMiles ?? null,
      locationSource: criteria.locationSource ?? null,
      vehicleClass: criteria.vehicleClass ?? null,
      limit: criteria.limit ?? ROUTE_CATALOG_SUMMARY_PAGE_SIZE,
    },
  });
  throwIfCatalogRequestAborted(options.signal);
  const requestBody = buildRouteCatalogSearchBody(criteria);
  const { data, error, response } = await awaitCatalogRequest(
    supabase.functions.invoke('route-catalog-search', {
      body: requestBody,
      headers: {
        [ECS_ROUTE_CATALOG_REQUEST_ID_HEADER]: sentRequestId,
      },
      signal: options.signal,
      timeout: options.timeoutMs ?? ROUTE_CATALOG_REQUEST_TIMEOUT_MS,
    }),
    options.signal,
  );
  throwIfCatalogRequestAborted(options.signal);
  const queryEndedAtMs = getExplorePerformanceNow();
  const responseRecord = readRecord(data);
  const responseMeta = readRecord(responseRecord?.meta);
  const responseCorrelation = resolveECSRouteCatalogResponseRequestCorrelation({
    sentRequestId,
    responseHeaderRequestId: response?.headers?.get(ECS_ROUTE_CATALOG_REQUEST_ID_HEADER),
    responseMetaRequestId: responseMeta?.ecsRequestId ?? responseMeta?.ecs_request_id,
  });
  options.onEcsRequestId?.(responseCorrelation.requestId, requestKey);
  recordExplorePerformancePhase(perfRun, 'route_catalog_query', {
    startedAtMs,
    endedAtMs: queryEndedAtMs,
    metadata: {
      status: error ? 'error' : 'ok',
      functionName: 'route-catalog-search',
    },
  });

  if (error) {
    logExplorePerformanceDiagnostic(
      buildExplorePerformanceSummary(perfRun, { completedAtMs: queryEndedAtMs }),
    );
    throw new Error(error.message || 'Verified route catalog unavailable.');
  }

  const rawRecords = requireRouteCatalogSearchRecords(data);
  const guidanceDiagnosticRecords = readRouteCatalogSafeDiagnostics(data);
  const normalizeStartedAtMs = getExplorePerformanceNow();
  const normalized = normalizeRouteCatalogSearchResponse(data);
  if (rawRecords.length > 0 && normalized.records.length === 0) {
    throw new InvalidRouteCatalogSearchResponseError();
  }
  const clientInvalidRecordCount = Math.max(
    0,
    rawRecords.length - normalized.normalizedRecordCount,
  );
  const searchMeta: RouteCatalogSearchMeta = {
    ...normalized.searchMeta,
    ecsRequestId: responseCorrelation.requestId,
    clientInvalidRecordCount,
  };
  searchMeta.resultLimit = normalizeRouteSearchPageSize(requestBody.limit);
  searchMeta.additionalMatchesAvailable =
    searchMeta.additionalMatchesAvailable === true ||
    searchMeta.hasMore ||
    searchMeta.totalMatchedCount > searchMeta.offset + normalized.trailPacks.length;
  const requestedPage = routeCatalogSearchPage(criteria.page);
  if (
    searchMeta.page !== requestedPage ||
    searchMeta.pageSize !== searchMeta.resultLimit ||
    searchMeta.offset !== (requestedPage - 1) * searchMeta.pageSize ||
    (searchMeta.hasMore && (searchMeta.nextPage == null || searchMeta.nextPage <= searchMeta.page))
  ) {
    throw new InvalidRouteCatalogSearchResponseError();
  }
  const normalizeEndedAtMs = getExplorePerformanceNow();
  recordExplorePerformancePhase(perfRun, 'filter_sort', {
    startedAtMs: normalizeStartedAtMs,
    endedAtMs: normalizeEndedAtMs,
    metadata: {
      candidateCount: searchMeta.candidateCount,
      returnedRecords: normalized.records.length,
      returnedTrailPacks: normalized.trailPacks.length,
      returnedGuidanceDiagnosticTrailPacks:
        normalized.records.length - normalized.trailPacks.length,
      returnedSafeDiagnosticRecords: guidanceDiagnosticRecords.length,
      clientInvalidRecordCount,
    },
  });
  logExplorePerformanceDiagnostic(
    buildExplorePerformanceSummary(perfRun, { completedAtMs: normalizeEndedAtMs }),
  );
  logRouteCatalogClientCorrelationDiagnostic({
    event: 'client_normalization_complete',
    requestId: responseCorrelation.requestId,
    responseRequestId: responseCorrelation.requestId,
    responseIdSource: responseCorrelation.source,
    status: 'success',
    candidateCount: searchMeta.candidateCount,
    returnedCount: normalized.records.length,
    blockedCount: guidanceDiagnosticRecords.length,
    normalizedCount: normalized.trailPacks.length,
    rpcUsed: searchMeta.nearbyRouteRpcUsed,
    durationMs: normalizeEndedAtMs - startedAtMs,
  });
  logRouteCatalogVisibilityDiagnostic(
    'explore_query',
    buildExploreRouteCatalogQueryDiagnostic(normalized.records, {
      latitude: criteria.latitude,
      longitude: criteria.longitude,
      radiusMiles: criteria.radiusMiles,
      limit: criteria.limit ?? ROUTE_CATALOG_SUMMARY_PAGE_SIZE,
      expectedKnownRoutes: criteria.expectedKnownRoutes ?? ['rubicon'],
    }, {
      serverMeta: searchMeta,
    }) as unknown as Record<string, unknown>,
    {
      fingerprint: createECSAsyncRequestFingerprint({
        request: requestBody,
        count: normalized.records.length,
      }),
    },
  );
  return {
    trailPacks: normalized.trailPacks,
    guidanceDiagnosticTrailPacks: guidanceDiagnosticTrailPacksFromRouteCatalog(normalized.records),
    guidanceDiagnosticRecords,
    coverageState: normalized.coverageState,
    searchMeta,
  };
}

export function getCachedRouteCatalogTrailPackDetail(
  trailPack: ECSTrailPack | string,
  options: LiveTrailPackCatalogRefreshOptions = {},
): ECSTrailPack | null {
  const routeId = String(typeof trailPack === 'string' ? trailPack : trailPack.id).trim();
  if (!routeId || options.signal?.aborted) return null;
  const sourceVersion = detailSourceVersion(trailPack, options);
  const detailKey = routeCatalogDetailKey(routeId, sourceVersion);
  const reconciliationTarget = captureRouteCatalogDetailReconciliationTarget(routeId, sourceVersion);
  const nowMs = Date.now();
  const cached = routeCatalogDetailCache.get(detailKey);
  if (cached && nowMs - cached.storedAtMs <= ROUTE_CATALOG_DETAIL_CACHE_TTL_MS) {
    routeCatalogDetailCache.delete(detailKey);
    routeCatalogDetailCache.set(detailKey, cached);
    reconcileRouteCatalogDetail(reconciliationTarget, cached.trailPack);
    return cached.trailPack;
  }
  if (cached) routeCatalogDetailCache.delete(detailKey);
  return null;
}

export async function fetchRouteCatalogTrailPackDetail(
  trailPack: ECSTrailPack | string,
  options: LiveTrailPackCatalogRefreshOptions = {},
): Promise<ECSTrailPack> {
  const routeId = String(typeof trailPack === 'string' ? trailPack : trailPack.id).trim();
  if (!routeId) throw new Error('Verified route detail unavailable.');
  throwIfCatalogRequestAborted(options.signal);
  const sourceVersion = detailSourceVersion(trailPack, options);
  const detailKey = routeCatalogDetailKey(routeId, sourceVersion);
  const reconciliationTarget = captureRouteCatalogDetailReconciliationTarget(routeId, sourceVersion);

  const cached = getCachedRouteCatalogTrailPackDetail(trailPack, options);
  if (cached) return cached;

  const pending = pendingDetailRequestsByKey.get(detailKey);
  if (pending && !pending.controller.signal.aborted) {
    return subscribeToSharedRequest(pending, options);
  }
  if (pending) pendingDetailRequestsByKey.delete(detailKey);

  const lifecycle = createCatalogRequestLifecycle({ timeoutMs: options.timeoutMs });
  const { controller } = lifecycle;
  const generation = currentRouteCatalogDetailGeneration(routeId);

  const request = (async () => {
    try {
      throwIfCatalogRequestAborted(controller.signal);
      const { data, error } = await awaitCatalogRequest(
        supabase.functions.invoke('route-catalog-detail', {
          body: {
            id: routeId,
            publicId: routeId,
            includeGeometry: true,
            includeAssessment: true,
            includeOfflineCache: true,
          },
          signal: controller.signal,
          timeout: options.timeoutMs ?? ROUTE_CATALOG_REQUEST_TIMEOUT_MS,
        }),
        controller.signal,
      );
      throwIfCatalogRequestAborted(controller.signal);

      if (error) {
        throw new Error(error.message || 'Verified route detail unavailable.');
      }

      const normalized = normalizeRouteCatalogDetailResponse(
        data,
        typeof trailPack === 'string' ? undefined : trailPack,
      );
      if (!normalized) {
        throw new Error('Route catalog returned no usable route detail.');
      }
      if (normalized.id !== routeId) {
        throw new Error('Verified route detail identity mismatch.');
      }

      throwIfCatalogRequestAborted(controller.signal);
      if (generation !== currentRouteCatalogDetailGeneration(routeId)) {
        throw createCatalogAbortError('Verified route detail was superseded.');
      }
      routeCatalogDetailCache.delete(detailKey);
      routeCatalogDetailCache.set(detailKey, {
        trailPack: normalized,
        routeId,
        sourceVersion,
        storedAtMs: Date.now(),
      });
      while (routeCatalogDetailCache.size > ROUTE_CATALOG_DETAIL_CACHE_MAX_ENTRIES) {
        const oldestDetailKey = routeCatalogDetailCache.keys().next().value;
        if (typeof oldestDetailKey !== 'string') break;
        routeCatalogDetailCache.delete(oldestDetailKey);
      }
      reconcileRouteCatalogDetail(reconciliationTarget, normalized);
      return normalized;
    } catch (error) {
      if (lifecycle.didTimeout()) {
        const timeoutError = new Error('Verified route detail request timed out.');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      if (isCatalogAbortError(error, controller.signal)) throw createCatalogAbortError();
      throw error;
    }
  })().finally(() => {
    lifecycle.cleanup();
    if (pendingDetailRequestsByKey.get(detailKey)?.promise === request) {
      pendingDetailRequestsByKey.delete(detailKey);
    }
  });

  const pendingEntry: PendingDetailRequest = {
    promise: request,
    controller,
    routeId,
    generation,
    subscribers: new Set<number>(),
    cancelWhenUnobserved: (reason) => controller.abort(reason),
  };
  pendingDetailRequestsByKey.set(detailKey, pendingEntry);
  return subscribeToSharedRequest(pendingEntry, options);
}

export function invalidateRouteCatalogTrailPackDetail(routeId?: string | null): void {
  const normalizedRouteId = String(routeId ?? '').trim();
  if (normalizedRouteId) {
    routeCatalogDetailGenerations.set(
      normalizedRouteId,
      currentRouteCatalogDetailGeneration(normalizedRouteId) + 1,
    );
    routeCatalogDetailCache.forEach((entry, detailKey) => {
      if (entry.routeId === normalizedRouteId) routeCatalogDetailCache.delete(detailKey);
    });
    pendingDetailRequestsByKey.forEach((entry, detailKey) => {
      if (entry.routeId !== normalizedRouteId) return;
      entry.controller.abort('superseded');
      pendingDetailRequestsByKey.delete(detailKey);
    });
    return;
  }
  const routeIds = new Set<string>([
    ...Array.from(routeCatalogDetailCache.values(), (entry) => entry.routeId),
    ...Array.from(pendingDetailRequestsByKey.values(), (entry) => entry.routeId),
  ]);
  routeIds.forEach((id) => {
    routeCatalogDetailGenerations.set(id, currentRouteCatalogDetailGeneration(id) + 1);
  });
  pendingDetailRequestsByKey.forEach((entry) => entry.controller.abort('superseded'));
  pendingDetailRequestsByKey.clear();
  routeCatalogDetailCache.clear();
}

async function fetchLegacyTrailPacks(
  criteria: LiveTrailPackCatalogSearchCriteria,
  options: LiveTrailPackCatalogRefreshOptions = {},
): Promise<ECSTrailPack[]> {
  throwIfCatalogRequestAborted(options.signal);
  const query = supabase
    .from('trail_packs')
    .select(TRAIL_PACK_SELECT)
    .eq('review_status', 'approved')
    .neq('source', 'partner_source')
    .order('updated_at', { ascending: false })
    .limit(200);
  const { data, error } = await awaitCatalogRequest(
    options.signal ? query.abortSignal(options.signal) : query,
    options.signal,
  );
  throwIfCatalogRequestAborted(options.signal);

  if (error) {
    throw new Error(error.message || 'Live Trail Pack catalog unavailable.');
  }

  return dedupeUniqueRankedRoutes(normalizeLiveTrailPackRecords(data)
    .filter((trailPack) => legacyTrailPackMatchesCriteria(trailPack, criteria))
    .sort((left, right) => compareLegacyTrailPacksForSearch(left, right, criteria))
    .map((trailPack) => ({
      ...trailPack,
      confidenceReasons: [
        ...trailPack.confidenceReasons,
        'Guidance readiness is unavailable until ECS route catalog verification succeeds.',
      ],
      catalogVerification: {
        status: 'caution',
        sourceLabel: 'Legacy Trail Pack fallback',
        publicRecommendation: false,
        confidenceScore: Math.min(trailPack.confidenceScore, 74),
        warnings: ['Primary ECS route catalog verification is unavailable.'],
        blockers: ['Verified route catalog evidence is unavailable for this fallback record.'],
        dataUsed: [],
        lastEvaluatedAt: trailPack.updatedAt,
      },
    })), (trailPack) => trailPack.id);
}

export function refreshLiveTrailPackCatalog(
  criteria: LiveTrailPackCatalogSearchCriteria = {},
  options: LiveTrailPackCatalogRefreshOptions = {},
): Promise<LiveTrailPackCatalogSnapshot> {
  const accessContextPartition = normalizeExploreAccessContextPartition(
    criteria.accessContextPartition,
  );
  if (snapshot.accessContextPartition !== accessContextPartition) {
    transitionLiveTrailPackCatalogAccessContext(accessContextPartition);
  }
  const refreshKey = createLiveTrailPackCatalogRefreshKey(criteria);
  const pendingRefresh = pendingRefreshesByKey.get(refreshKey);
  if (pendingRefresh && !pendingRefresh.controller.signal.aborted) {
    return subscribeToSharedRequest(pendingRefresh, options, true);
  }
  if (pendingRefresh) pendingRefreshesByKey.delete(refreshKey);

  if (activeCatalogRefresh) {
    const superseded = activeCatalogRefresh;
    superseded.controller.abort('superseded');
    if (pendingRefreshesByKey.get(superseded.refreshKey)?.promise === superseded.promise) {
      pendingRefreshesByKey.delete(superseded.refreshKey);
    }
    activeCatalogRefresh = null;
  }
  const requestSequence = refreshRequestSequence + 1;
  refreshRequestSequence = requestSequence;
  const attemptedAt = new Date().toISOString();
  const snapshotBeforeRequest = cloneLiveTrailPackCatalogSnapshot(snapshot);
  const retryRequestId =
    snapshotBeforeRequest.asyncState.retryEligible &&
    snapshotBeforeRequest.ecsRequestKey === refreshKey
    ? normalizeECSRouteCatalogRequestId(options.retryEcsRequestId)
    : null;
  const primaryEcsRequestId = retryRequestId ?? createECSRouteCatalogRequestId();
  const requestedPage = routeCatalogSearchPage(criteria.page);
  const refreshFamily = routeCatalogRefreshFamilyKey(refreshKey);
  const currentFamily = routeCatalogRefreshFamilyKey(snapshotBeforeRequest.refreshKey);
  const paginationBaseSnapshot = requestedPage > 1 &&
    refreshFamily != null &&
    currentFamily === refreshFamily &&
    snapshotBeforeRequest.refreshKey
    ? snapshotBeforeRequest
    : null;
  const sameQuery = snapshotBeforeRequest.refreshKey === refreshKey;
  const presentationSnapshot = paginationBaseSnapshot ?? (sameQuery ? snapshotBeforeRequest : null);
  const presentationRefreshKey = paginationBaseSnapshot?.refreshKey ?? refreshKey;
  const initialData = presentationSnapshot ? catalogDataFromSnapshot(presentationSnapshot) : null;
  const initialLastGoodData = presentationSnapshot &&
    hasUsableCatalogData(presentationSnapshot.asyncState.lastGoodData)
      ? {
        trailPacks: [...presentationSnapshot.asyncState.lastGoodData.trailPacks],
        guidanceDiagnosticTrailPacks: [
          ...presentationSnapshot.asyncState.lastGoodData.guidanceDiagnosticTrailPacks,
        ],
        guidanceDiagnosticRecords: [
          ...presentationSnapshot.asyncState.lastGoodData.guidanceDiagnosticRecords,
        ],
        routeCatalogSummaries: [...presentationSnapshot.asyncState.lastGoodData.routeCatalogSummaries],
      }
    : hasUsableCatalogData(initialData)
      ? initialData
      : null;
  const stateBeforeRequest: ECSAsyncSurfaceState<LiveTrailPackCatalogData> = {
    ...(presentationSnapshot?.asyncState ?? snapshotBeforeRequest.asyncState),
    data: initialData,
    lastGoodData: initialLastGoodData,
    source: initialData ? presentationSnapshot?.asyncState.source ?? 'unavailable' : 'unavailable',
    freshness: initialData ? presentationSnapshot?.asyncState.freshness ?? 'unavailable' : 'unavailable',
    resultCount: initialData
      ? catalogResultCount(initialData)
      : null,
  };
  const requestState = beginECSAsyncSurfaceRequest(stateBeforeRequest, {
    fingerprintInput: createLiveTrailPackCatalogRefreshKey(criteria),
    provider: 'route-catalog-search',
    preserveData: Boolean(presentationSnapshot),
    preserveLastGood: Boolean(presentationSnapshot),
  });
  setSnapshot({
    ...(presentationSnapshot ?? snapshotBeforeRequest),
    trailPacks: presentationSnapshot ? presentationSnapshot.trailPacks : [],
    guidanceDiagnosticTrailPacks: presentationSnapshot
      ? presentationSnapshot.guidanceDiagnosticTrailPacks
      : [],
    guidanceDiagnosticRecords: presentationSnapshot
      ? presentationSnapshot.guidanceDiagnosticRecords
      : [],
    routeCatalogSummaries: presentationSnapshot ? presentationSnapshot.routeCatalogSummaries : [],
    status: 'loading',
    error: null,
    lastRefreshAttemptAt: attemptedAt,
    refreshKey: presentationRefreshKey,
    ecsRequestId: primaryEcsRequestId,
    ecsRequestKey: refreshKey,
    accessContextPartition,
    preservedFromEmptyRefresh: false,
    preservedReason: null,
    asyncState: requestState,
  });

  let allConsumerCancellationReason = options.cancellationReason ?? 'consumer_cancelled';
  const lifecycle = createCatalogRequestLifecycle({ timeoutMs: options.timeoutMs });
  const { controller } = lifecycle;
  const identity = {
    requestId: requestState.requestId,
    generation: requestState.generation,
    requestFingerprint: requestState.requestFingerprint,
  };
  const isCurrent = () => requestSequence === refreshRequestSequence;
  const trackEcsRequestId = (requestId: string, requestKey: string) => {
    if (!isCurrent()) return;
    if (snapshot.ecsRequestId === requestId && snapshot.ecsRequestKey === requestKey) return;
    setSnapshot({
      ...snapshot,
      ecsRequestId: requestId,
      ecsRequestKey: requestKey,
    });
  };
  const settleCatalog = (args: {
    status: 'ready' | 'empty' | 'stale' | 'degraded' | 'cancelled' | 'error';
    data: LiveTrailPackCatalogData;
    sourceTruth: 'live' | 'cached' | 'unavailable';
    freshness: 'live' | 'recent' | 'stale' | 'unavailable';
    safeErrorCode?: string | null;
    retryEligible?: boolean;
    cancellationReason?: ECSAsyncCancellationReason | null;
    providerStatus?: 'active' | 'unavailable';
    error?: string | null;
    coverageState?: RouteCatalogCoverageState;
    searchMeta?: RouteCatalogSearchMeta | null;
    catalogSource?: LiveTrailPackCatalogSnapshot['source'];
    preservedReason?: string | null;
    loadedAt?: string | null;
    preserveLastGood?: boolean;
    lastGoodData?: LiveTrailPackCatalogData | null;
  }): LiveTrailPackCatalogSnapshot => {
    if (!isCurrent()) return liveTrailPackCatalogStore.getSnapshot();
    const transition = settleECSAsyncSurfaceRequest(snapshot.asyncState, {
      ...identity,
      status: args.status,
      data: args.data,
      source: args.sourceTruth,
      freshness: args.freshness,
      safeErrorCode: args.safeErrorCode,
      retryEligible: args.retryEligible,
      cancellationReason: args.cancellationReason,
      providerStatus: args.providerStatus,
      resultCount: catalogResultCount(args.data),
      preserveLastGood: args.preserveLastGood,
      lastGoodData: args.lastGoodData,
    });
    if (!transition.applied) return liveTrailPackCatalogStore.getSnapshot();
    const terminalSnapshot: LiveTrailPackCatalogSnapshot = {
      trailPacks: [...args.data.trailPacks],
      guidanceDiagnosticTrailPacks: [...args.data.guidanceDiagnosticTrailPacks],
      guidanceDiagnosticRecords: [...args.data.guidanceDiagnosticRecords],
      routeCatalogSummaries: [...args.data.routeCatalogSummaries],
      status: transition.state.status,
      error: args.error ?? null,
      lastLoadedAt: args.loadedAt === undefined ? snapshot.lastLoadedAt : args.loadedAt,
      lastRefreshAttemptAt: attemptedAt,
      coverageState: args.coverageState ?? snapshot.coverageState,
      searchMeta: args.searchMeta === undefined ? snapshot.searchMeta : args.searchMeta,
      ecsRequestId: snapshot.ecsRequestId,
      ecsRequestKey: snapshot.ecsRequestKey,
      source: args.catalogSource ?? snapshot.source,
      accessContextPartition,
      refreshKey,
      preservedFromEmptyRefresh: Boolean(args.preservedReason),
      preservedReason: args.preservedReason ?? null,
      asyncState: transition.state,
    };
    if (paginationBaseSnapshot?.refreshKey) {
      return setSnapshot(mergeLiveTrailPackCatalogPageSnapshots(
        paginationBaseSnapshot,
        terminalSnapshot,
        paginationBaseSnapshot.refreshKey,
      ));
    }
    return setSnapshot(terminalSnapshot);
  };

  const refreshPromise = (async () => {
    let primaryFailureSafeCode = 'ROUTE_CATALOG_PROVIDER_UNAVAILABLE';
    try {
      let cachedSummarySnapshot: LiveTrailPackCatalogSnapshot | null = null;
      if (!paginationBaseSnapshot) {
        try {
          cachedSummarySnapshot = await readCachedRouteCatalogSummarySnapshot(criteria, refreshKey);
        } catch {
          cachedSummarySnapshot = null;
        }
      }
      throwIfCatalogRequestAborted(controller.signal);
      if (!isCurrent()) return liveTrailPackCatalogStore.getSnapshot();
      if (cachedSummarySnapshot && snapshot.trailPacks.length === 0) {
        const cachedData: LiveTrailPackCatalogData = {
          trailPacks: [],
          guidanceDiagnosticTrailPacks: [],
          guidanceDiagnosticRecords: [],
          routeCatalogSummaries: cachedSummarySnapshot.routeCatalogSummaries,
        };
        setSnapshot({
          ...cachedSummarySnapshot,
          status: 'loading',
          lastRefreshAttemptAt: attemptedAt,
          ecsRequestId: snapshot.ecsRequestId,
          ecsRequestKey: snapshot.ecsRequestKey,
          asyncState: {
            ...snapshot.asyncState,
            data: cachedData,
            lastGoodData: cachedData,
            source: 'cached',
            freshness: 'stale',
            resultCount: cachedData.routeCatalogSummaries.length,
          },
        });
      }

      const stagedCriteria = paginationBaseSnapshot ? null : stagedRouteCatalogSearchCriteria(criteria);
      if (stagedCriteria) {
        try {
          const staged = await fetchRouteCatalogTrailPacks(stagedCriteria, {
            signal: controller.signal,
            timeoutMs: options.timeoutMs,
            onEcsRequestId: trackEcsRequestId,
          });
          throwIfCatalogRequestAborted(controller.signal);
          if (!isCurrent()) return liveTrailPackCatalogStore.getSnapshot();
          if (
            staged.trailPacks.length > 0 ||
            staged.guidanceDiagnosticTrailPacks.length > 0 ||
            staged.guidanceDiagnosticRecords.length > 0
          ) {
            const stagedData: LiveTrailPackCatalogData = {
              trailPacks: staged.trailPacks,
              guidanceDiagnosticTrailPacks: staged.guidanceDiagnosticTrailPacks,
              guidanceDiagnosticRecords: staged.guidanceDiagnosticRecords,
              routeCatalogSummaries: routeCatalogSummariesFromTrailPacks(staged.trailPacks),
            };
            const stagedSnapshot = setSnapshot({
              trailPacks: stagedData.trailPacks,
              guidanceDiagnosticTrailPacks: stagedData.guidanceDiagnosticTrailPacks,
              guidanceDiagnosticRecords: stagedData.guidanceDiagnosticRecords,
              routeCatalogSummaries: stagedData.routeCatalogSummaries,
              status: 'loading',
              error: null,
              lastLoadedAt: attemptedAt,
              lastRefreshAttemptAt: attemptedAt,
              coverageState: staged.coverageState,
              searchMeta: staged.searchMeta,
              ecsRequestId: staged.searchMeta.ecsRequestId ?? snapshot.ecsRequestId,
              ecsRequestKey: createLiveTrailPackCatalogRefreshKey(stagedCriteria),
              source: 'route_catalog',
              accessContextPartition,
              refreshKey,
              preservedFromEmptyRefresh: false,
              preservedReason: 'staged_result_revalidate',
              asyncState: {
                ...snapshot.asyncState,
                data: stagedData,
                lastGoodData: stagedData,
                source: 'live',
                freshness: 'recent',
                resultCount: catalogResultCount(stagedData),
              },
            });
            writeRouteCatalogSummaryCache(stagedCriteria, stagedSnapshot);
          }
        } catch (error) {
          if (isCatalogAbortError(error, controller.signal)) throw error;
          if (!isCurrent()) return liveTrailPackCatalogStore.getSnapshot();
        }
      }

      try {
        const routeCatalog = await fetchRouteCatalogTrailPacks(criteria, {
          signal: controller.signal,
          timeoutMs: options.timeoutMs,
          ecsRequestId: primaryEcsRequestId,
          onEcsRequestId: trackEcsRequestId,
        });
        throwIfCatalogRequestAborted(controller.signal);
        if (!isCurrent()) return liveTrailPackCatalogStore.getSnapshot();
        const liveData: LiveTrailPackCatalogData = {
          trailPacks: routeCatalog.trailPacks,
          guidanceDiagnosticTrailPacks: routeCatalog.guidanceDiagnosticTrailPacks,
          guidanceDiagnosticRecords: routeCatalog.guidanceDiagnosticRecords,
          routeCatalogSummaries: routeCatalogSummariesFromTrailPacks(routeCatalog.trailPacks),
        };
        const hasProviderResults = catalogResultCount(liveData) > 0;
        const hasInvalidProviderRecords =
          (routeCatalog.searchMeta.clientInvalidRecordCount ?? 0) > 0;
        const nextSnapshot = settleCatalog({
          status: hasProviderResults
            ? hasInvalidProviderRecords
              ? 'degraded'
              : 'ready'
            : 'empty',
          data: liveData,
          sourceTruth: 'live',
          freshness: hasInvalidProviderRecords ? 'recent' : 'live',
          safeErrorCode: hasInvalidProviderRecords
            ? 'ROUTE_CATALOG_PARTIAL_INVALID_RESPONSE'
            : null,
          retryEligible: hasInvalidProviderRecords,
          providerStatus: 'active',
          error: hasInvalidProviderRecords
            ? 'Some route records were invalid and excluded. Valid verified routes remain available.'
            : null,
          coverageState: routeCatalog.coverageState,
          searchMeta: routeCatalog.searchMeta,
          catalogSource: 'route_catalog',
          loadedAt: attemptedAt,
          preserveLastGood: hasProviderResults,
          lastGoodData: hasProviderResults ? liveData : null,
        });
        writeRouteCatalogSummaryCache(criteria, nextSnapshot);
        return nextSnapshot;
      } catch (routeCatalogError) {
        if (isCatalogAbortError(routeCatalogError, controller.signal)) throw routeCatalogError;
        if (routeCatalogError instanceof InvalidRouteCatalogSearchResponseError) {
          primaryFailureSafeCode = 'ROUTE_CATALOG_INVALID_RESPONSE';
        }
      }

      if (routeCatalogSearchPage(criteria.page) > 1) {
        const paginationFailureData: LiveTrailPackCatalogData = {
          trailPacks: [],
          guidanceDiagnosticTrailPacks: [],
          guidanceDiagnosticRecords: [],
          routeCatalogSummaries: [],
        };
        return settleCatalog({
          status: 'error',
          data: paginationFailureData,
          sourceTruth: 'unavailable',
          freshness: 'unavailable',
          safeErrorCode: primaryFailureSafeCode,
          retryEligible: true,
          providerStatus: 'unavailable',
          error: 'The next verified route catalog page is unavailable.',
          catalogSource: 'unavailable',
          preserveLastGood: false,
          lastGoodData: null,
        });
      }

      try {
        const legacyTrailPacks = await fetchLegacyTrailPacks(criteria, { signal: controller.signal });
        throwIfCatalogRequestAborted(controller.signal);
        if (!isCurrent()) return liveTrailPackCatalogStore.getSnapshot();
        if (legacyTrailPacks.length > 0) {
          const fallbackData: LiveTrailPackCatalogData = {
            trailPacks: legacyTrailPacks,
            guidanceDiagnosticTrailPacks: [],
            guidanceDiagnosticRecords: [],
            routeCatalogSummaries: routeCatalogSummariesFromTrailPacks(legacyTrailPacks),
          };
          const nextSnapshot = settleCatalog({
            status: 'degraded',
            data: fallbackData,
            sourceTruth: 'live',
            freshness: 'recent',
            safeErrorCode: primaryFailureSafeCode === 'ROUTE_CATALOG_INVALID_RESPONSE'
              ? primaryFailureSafeCode
              : 'ROUTE_CATALOG_PRIMARY_UNAVAILABLE',
            retryEligible: true,
            providerStatus: 'unavailable',
            error: 'Verified routes are temporarily unavailable. Showing the labeled fallback catalog.',
            coverageState: getRouteCatalogCoverageState(legacyTrailPacks, { userHasCriteria: false }),
            searchMeta: null,
            catalogSource: 'trail_packs_fallback',
            preservedReason: 'primary_provider_unavailable',
            loadedAt: attemptedAt,
          });
          writeRouteCatalogSummaryCache(criteria, nextSnapshot);
          return nextSnapshot;
        }
      } catch (legacyError) {
        if (isCatalogAbortError(legacyError, controller.signal)) throw legacyError;
      }

      const lastGoodData = hasUsableCatalogData(snapshot.asyncState.lastGoodData)
        ? snapshot.asyncState.lastGoodData
        : null;
      if (lastGoodData && catalogResultCount(lastGoodData) > 0) {
        return settleCatalog({
          status: 'stale',
          data: lastGoodData,
          sourceTruth: snapshot.asyncState.source === 'cached' ? 'cached' : 'live',
          freshness: 'stale',
          safeErrorCode: primaryFailureSafeCode,
          retryEligible: true,
          providerStatus: 'unavailable',
          error: 'Live route updates are unavailable. Showing the last known catalog.',
          catalogSource: snapshot.source,
          preservedReason: 'same_query_refresh_unavailable',
        });
      }
      return settleCatalog({
        status: 'error',
        data: {
          trailPacks: [],
          guidanceDiagnosticTrailPacks: [],
          guidanceDiagnosticRecords: [],
          routeCatalogSummaries: [],
        },
        sourceTruth: 'unavailable',
        freshness: 'unavailable',
        safeErrorCode: primaryFailureSafeCode,
        retryEligible: true,
        providerStatus: 'unavailable',
        error: 'Verified route catalog is temporarily unavailable.',
        coverageState: getRouteCatalogCoverageState([], { unavailable: true }),
        searchMeta: null,
        catalogSource: 'unavailable',
      });
    } catch (error) {
      if (!isCurrent()) return liveTrailPackCatalogStore.getSnapshot();
      const lastGoodData = hasUsableCatalogData(snapshot.asyncState.lastGoodData)
        ? snapshot.asyncState.lastGoodData
        : null;
      if (lifecycle.didTimeout()) {
        return settleCatalog({
          status: lastGoodData ? 'stale' : 'error',
          data: lastGoodData ?? {
            trailPacks: [],
            guidanceDiagnosticTrailPacks: [],
            guidanceDiagnosticRecords: [],
            routeCatalogSummaries: [],
          },
          sourceTruth: lastGoodData ? (snapshot.asyncState.source === 'cached' ? 'cached' : 'live') : 'unavailable',
          freshness: lastGoodData ? 'stale' : 'unavailable',
          safeErrorCode: 'ROUTE_CATALOG_TIMEOUT',
          retryEligible: true,
          providerStatus: 'unavailable',
          error: lastGoodData
            ? 'Route catalog refresh timed out. Showing the last known catalog.'
            : 'Route catalog request timed out.',
          catalogSource: lastGoodData ? snapshot.source : 'unavailable',
          preservedReason: lastGoodData ? 'timeout_last_good' : null,
        });
      }
      if (isCatalogAbortError(error, controller.signal)) {
        const cancellationReason = allConsumerCancellationReason;
        const transition = cancelECSAsyncSurfaceRequest(snapshot.asyncState, {
          ...identity,
          reason: cancellationReason,
        });
        if (!transition.applied) return liveTrailPackCatalogStore.getSnapshot();
        const cancelledData = transition.state.data;
        const cancelledState = {
          ...transition.state,
          resultCount: cancelledData ? catalogResultCount(cancelledData) : 0,
        };
        return setSnapshot({
          ...snapshot,
          status: 'cancelled',
          error: 'Route catalog update was cancelled.',
          lastRefreshAttemptAt: attemptedAt,
          preservedFromEmptyRefresh: hasUsableCatalogData(cancelledData),
          preservedReason: cancellationReason,
          asyncState: cancelledState,
        });
      }
      return settleCatalog({
        status: 'error',
        data: {
          trailPacks: [],
          guidanceDiagnosticTrailPacks: [],
          guidanceDiagnosticRecords: [],
          routeCatalogSummaries: [],
        },
        sourceTruth: 'unavailable',
        freshness: 'unavailable',
        safeErrorCode: 'ROUTE_CATALOG_UNEXPECTED',
        retryEligible: true,
        providerStatus: 'unavailable',
        error: 'Verified route catalog is temporarily unavailable.',
        coverageState: getRouteCatalogCoverageState([], { unavailable: true }),
        searchMeta: null,
        catalogSource: 'unavailable',
      });
    }
  })().finally(() => {
    lifecycle.cleanup();
    if (pendingRefreshesByKey.get(refreshKey)?.promise === refreshPromise) {
      pendingRefreshesByKey.delete(refreshKey);
    }
    if (activeCatalogRefresh?.promise === refreshPromise) activeCatalogRefresh = null;
  });

  const pendingEntry: PendingCatalogRefresh = {
    promise: refreshPromise,
    controller,
    requestSequence,
    subscribers: new Set<number>(),
    cancelWhenUnobserved: (reason) => {
      allConsumerCancellationReason = reason;
      controller.abort(reason);
    },
  };
  pendingRefreshesByKey.set(refreshKey, pendingEntry);
  activeCatalogRefresh = { ...pendingEntry, refreshKey };
  return subscribeToSharedRequest(pendingEntry, options, true);
}

export function setLiveTrailPackCatalogDisabled(args: {
  reason: 'feature_disabled' | 'permission_denied' | 'provider_disabled' | 'invalid_input';
  safeErrorCode: string;
  message: string;
}): LiveTrailPackCatalogSnapshot {
  activeCatalogRefresh?.controller.abort(args.reason);
  activeCatalogRefresh = null;
  refreshRequestSequence += 1;
  const asyncState = disableECSAsyncSurface(snapshot.asyncState, {
    reason: args.reason,
    safeErrorCode: args.safeErrorCode,
    providerStatus: args.reason === 'permission_denied' ? 'permission_denied' : 'disabled',
  });
  return setSnapshot({
    ...snapshot,
    status: 'disabled',
    error: args.message,
    lastRefreshAttemptAt: new Date().toISOString(),
    preservedFromEmptyRefresh: Boolean(asyncState.data),
    preservedReason: args.reason,
    asyncState,
  });
}

export function transitionLiveTrailPackCatalogAccessContext(
  accessContextPartition: unknown,
): LiveTrailPackCatalogSnapshot {
  const nextAccessContextPartition = normalizeExploreAccessContextPartition(
    accessContextPartition,
  );
  if (snapshot.accessContextPartition === nextAccessContextPartition) {
    return liveTrailPackCatalogStore.getSnapshot();
  }

  refreshRequestSequence += 1;
  pendingRefreshesByKey.forEach((pending) => pending.controller.abort('superseded'));
  pendingRefreshesByKey.clear();
  activeCatalogRefresh = null;
  invalidateRouteCatalogTrailPackDetail();
  return setSnapshot(emptyLiveTrailPackCatalogSnapshot(nextAccessContextPartition));
}

export const liveTrailPackCatalogStore = {
  getSnapshot(): LiveTrailPackCatalogSnapshot {
    return {
      trailPacks: [...snapshot.trailPacks],
      guidanceDiagnosticTrailPacks: [...snapshot.guidanceDiagnosticTrailPacks],
      guidanceDiagnosticRecords: [...snapshot.guidanceDiagnosticRecords],
      routeCatalogSummaries: [...snapshot.routeCatalogSummaries],
      status: snapshot.status,
      error: snapshot.error,
      lastLoadedAt: snapshot.lastLoadedAt,
      lastRefreshAttemptAt: snapshot.lastRefreshAttemptAt,
      coverageState: snapshot.coverageState,
      searchMeta: snapshot.searchMeta,
      ecsRequestId: snapshot.ecsRequestId,
      ecsRequestKey: snapshot.ecsRequestKey,
      source: snapshot.source,
      accessContextPartition: snapshot.accessContextPartition,
      refreshKey: snapshot.refreshKey,
      preservedFromEmptyRefresh: snapshot.preservedFromEmptyRefresh,
      preservedReason: snapshot.preservedReason,
      asyncState: {
        ...snapshot.asyncState,
        data: snapshot.asyncState.data
          ? {
              trailPacks: [...snapshot.asyncState.data.trailPacks],
              guidanceDiagnosticTrailPacks: [
                ...snapshot.asyncState.data.guidanceDiagnosticTrailPacks,
              ],
              guidanceDiagnosticRecords: [
                ...snapshot.asyncState.data.guidanceDiagnosticRecords,
              ],
              routeCatalogSummaries: [...snapshot.asyncState.data.routeCatalogSummaries],
            }
          : null,
        lastGoodData: snapshot.asyncState.lastGoodData
          ? {
              trailPacks: [...snapshot.asyncState.lastGoodData.trailPacks],
              guidanceDiagnosticTrailPacks: [
                ...snapshot.asyncState.lastGoodData.guidanceDiagnosticTrailPacks,
              ],
              guidanceDiagnosticRecords: [
                ...snapshot.asyncState.lastGoodData.guidanceDiagnosticRecords,
              ],
              routeCatalogSummaries: [...snapshot.asyncState.lastGoodData.routeCatalogSummaries],
            }
          : null,
      },
    };
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  refresh: refreshLiveTrailPackCatalog,
  disable: setLiveTrailPackCatalogDisabled,
  transitionAccessContext: transitionLiveTrailPackCatalogAccessContext,
};

/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
global.__DEV__ = false;

function compileTypescript(module, filename) {
  const source = require('fs').readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

const responses = [];
const legacyResponses = [];
const invocations = [];
const legacyQueryEvents = [];
const memoryCaches = new Map();
const mockSupabase = {
  functions: {
    async invoke(name, options) {
      invocations.push({
        name,
        body: options?.body ?? null,
        signal: options?.signal ?? null,
        timeout: options?.timeout ?? null,
      });
      const next = responses.shift();
      if (!next) {
        throw new Error(`Unexpected Supabase invocation: ${name}`);
      }
      return next;
    },
  },
  from(table) {
    if (table !== 'trail_packs' || legacyResponses.length === 0) {
      throw new Error('Legacy trail_packs fallback should not be used by this regression.');
    }
    const response = legacyResponses.shift();
    const query = {
      select(fields) { legacyQueryEvents.push({ type: 'select', fields }); return query; },
      eq() { return query; },
      neq(column, value) { legacyQueryEvents.push({ type: 'neq', column, value }); return query; },
      order() { return query; },
      limit() { return query; },
      abortSignal() { return query; },
      then(resolve, reject) {
        return Promise.resolve(response).then(resolve, reject);
      },
    };
    return query;
  },
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'web', select: (choices) => choices?.web ?? choices?.default },
    };
  }
  if (
    (request === '../supabase' || request === './supabase') &&
    parent?.filename.includes(`${path.sep}lib${path.sep}`)
  ) {
    return { supabase: mockSupabase };
  }
  if (
    request === '../keyValuePersistence' &&
    parent?.filename.endsWith(path.join('lib', 'explore', 'liveTrailPackCatalog.ts'))
  ) {
    return {
      createPersistedKeyValueCache(fileKey) {
        if (!memoryCaches.has(fileKey)) {
          const cache = new Map();
          memoryCaches.set(fileKey, {
            get: (key) => cache.get(key) ?? null,
            set: (key, value) => {
              cache.set(key, value);
            },
            delete: (key) => {
              cache.delete(key);
            },
            clear: () => {
              cache.clear();
            },
            flush: async () => {},
            waitForHydration: async () => {},
            isHydrated: () => true,
          });
        }
        return memoryCaches.get(fileKey);
      },
    };
  }
  return originalLoad.apply(this, [request, parent, isMain]);
};

const {
  buildRouteCatalogSearchBody,
  createLiveTrailPackCatalogRefreshKey,
  fetchRouteCatalogTrailPackDetail,
  getCachedRouteCatalogTrailPackDetail,
  invalidateRouteCatalogTrailPackDetail,
  mergeLiveTrailPackCatalogPageSnapshots,
  refreshLiveTrailPackCatalog,
  liveTrailPackCatalogStore,
  setLiveTrailPackCatalogDisabled,
} = require(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'));
const {
  isPublicSuggestedTrailheadTrailPack,
  routeCatalogSummaryToDeferredTrailPack,
  trailPackToExpeditionOpportunity,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));
const {
  buildExploreGuidanceReadyInventory,
  classifyExploreRouteAvailability,
  deriveExploreRouteSurfaceState,
} = require(path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'));

const postMigrationLiveFixture = JSON.parse(fs.readFileSync(
  path.join(root, 'fixtures', 'explore', 'route-catalog-search-post-migration.sanitized.json'),
  'utf8',
));

function routeRecord(id = 'preserved-tahoe-route') {
  return {
    id,
    public_id: id,
    name: 'Preserved Tahoe Route',
    description: 'A public source-backed route used to verify refresh stability.',
    route_type: 'loop',
    center_latitude: 38.92,
    center_longitude: -120.78,
    route_geometry_mode: 'full',
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [-120.78, 38.92],
        [-120.76, 38.94],
        [-120.73, 38.95],
      ],
    },
    distance_miles: 12.5,
    estimated_duration_minutes: 210,
    difficulty: 'moderate',
    official_access_coverage_pct: 96,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    verification_status: 'verified',
    review_status: 'approved',
    recommendation_status: 'recommended',
    source_records: [
      {
        provider_id: 'usfs-mvum',
        label: 'USFS MVUM',
        source_type: 'official',
        authority: 'official',
        last_verified_at: '2026-06-01T00:00:00.000Z',
      },
    ],
    route_intelligence: {
      tripType: 'day_trip',
      aliases: ['preserved tahoe route'],
      bounds: {
        minLatitude: 38.92,
        minLongitude: -120.78,
        maxLatitude: 38.95,
        maxLongitude: -120.73,
      },
      trailheadCoordinate: { latitude: 38.92, longitude: -120.78 },
    },
    tags: ['Tahoe National Forest', 'day trip'],
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-02T00:00:00.000Z',
  };
}

function lightweightRouteRecord(
  id,
  {
    name = 'Lightweight catalog route',
    updatedAt = '2026-06-02T00:00:00.000Z',
  } = {},
) {
  const record = routeRecord(id);
  delete record.route_geometry;
  return {
    ...record,
    name,
    route_geometry_mode: 'omitted',
    geometry_quality: 'good',
    updated_at: updatedAt,
  };
}

function searchResponse(records, coverageState, diagnosticRecords = [], metaOverrides = {}) {
  return {
    data: {
      records,
      diagnosticRecords,
      coverageState,
      meta: {
        candidateCount: records.length,
        radiusMatchedCount: records.length,
        geometryMatchedCount: records.length,
        trailheadMatchedCount: records.length,
        centerMatchedCount: records.length,
        curationCandidateCount: diagnosticRecords.length,
        safeDiagnosticCount: diagnosticRecords.length,
        anySourceBackedCandidateCount: records.length + diagnosticRecords.length,
        radiusFilterApplied: true,
        ...metaOverrides,
      },
    },
    error: null,
  };
}

function safeDiagnosticRecord(id, exclusionReasons = ['access_unverified']) {
  return {
    routeId: id,
    publicId: id,
    name: `Sanitized diagnostic ${id}`,
    exclusionReasons,
    sourceTypes: ['official'],
    reviewStatus: 'approved',
    recommendationStatus: 'needs_review',
    updatedAt: '2026-07-18T00:00:00.000Z',
  };
}

function fixtureResponse(overrides = {}) {
  const records = (overrides.records ?? postMigrationLiveFixture.records).map((record) =>
    record._location_redacted === true
      ? {
          ...record,
          // The committed fixture intentionally has no coordinates. Restore a
          // neutral, non-user coordinate only in memory so the production
          // normalizer can exercise its required location contract.
          center_latitude: 0,
          center_longitude: 0,
        }
      : record);
  return {
    data: {
      ...postMigrationLiveFixture,
      ...overrides,
      records,
      meta: {
        ...postMigrationLiveFixture.meta,
        ...(overrides.meta ?? {}),
      },
    },
    error: null,
  };
}

function buildProductionExploreSurface(snapshot, currentRefreshKey, sourceFilter = 'all') {
  const catalogPackIds = new Set(snapshot.trailPacks.map((trailPack) => trailPack.id));
  const summarySourceState = snapshot.asyncState.source === 'cached'
    ? 'cached'
    : snapshot.status === 'stale' || snapshot.status === 'degraded'
      ? 'stale'
      : 'live';
  const summaryPacks = snapshot.routeCatalogSummaries.flatMap((summary) => {
    if (catalogPackIds.has(summary.routeId)) return [];
    const pack = routeCatalogSummaryToDeferredTrailPack(summary, {
      publicRecommendation:
        snapshot.source === 'route_catalog' && summary.sourceType !== 'preview',
      sourceState: summarySourceState,
    });
    return pack ? [pack] : [];
  });
  const trailPackRoutes = [
    ...snapshot.trailPacks,
    ...summaryPacks,
    ...snapshot.guidanceDiagnosticTrailPacks,
  ].map((trailPack) => {
    const route = trailPackToExpeditionOpportunity(trailPack);
    return {
      ...route,
      routeMetadata: {
        ...(route.routeMetadata ?? {}),
        withinRadius: true,
        exploreGuidanceReadyEnabled: true,
        routeCatalogSourceVersion: trailPack.updatedAt ?? null,
      },
    };
  });
  const inventory = buildExploreGuidanceReadyInventory({
    trailPacks: trailPackRoutes,
    hiddenGemRoutes: [],
    ecsRouteIdeas: [],
    favoriteRoutes: [],
    savedRouteAssets: [],
    selectedRefinement: null,
  });
  const candidateSet = inventory.discoverableCandidateSet;
  const visibleCandidates = sourceFilter === 'all'
    ? candidateSet.candidates
    : candidateSet.candidates.filter((candidate) => candidate.sourceKind === sourceFilter);
  const curationCandidateCount = snapshot.searchMeta?.curationCandidateCount ?? 0;
  const providerNotReadyCount =
    snapshot.guidanceDiagnosticTrailPacks.length +
    Math.max(snapshot.guidanceDiagnosticRecords.length, curationCandidateCount);
  const unmaterializedProviderNotReadyCount = Math.max(
    0,
    providerNotReadyCount - snapshot.guidanceDiagnosticTrailPacks.length,
  );
  const guidanceNotReadyCount =
    inventory.rangeExclusionTotal + unmaterializedProviderNotReadyCount;
  const evaluatedCount = inventory.totalReadyCount + guidanceNotReadyCount;
  const hasRangeData =
    snapshot.trailPacks.length > 0 ||
    snapshot.routeCatalogSummaries.length > 0 ||
    providerNotReadyCount > 0;
  const validEmpty =
    snapshot.status === 'empty' &&
    snapshot.refreshKey === currentRefreshKey &&
    snapshot.trailPacks.length === 0 &&
    snapshot.routeCatalogSummaries.length === 0 &&
    providerNotReadyCount === 0 &&
    evaluatedCount === 0;
  const surface = deriveExploreRouteSurfaceState({
    status: snapshot.status,
    providerStatus: snapshot.asyncState.providerStatus,
    catalogSource: snapshot.source,
    sourceTruth: snapshot.asyncState.source,
    freshness: snapshot.asyncState.freshness,
    snapshotRefreshKey: snapshot.refreshKey,
    currentRefreshKey,
    visibleCandidateCount: visibleCandidates.length,
    candidateCount: candidateSet.candidates.length,
    discoverableCount: inventory.totalDiscoverableCount,
    readyCount: inventory.totalReadyCount,
    evaluatedCount,
    hasRangeData,
    isSourceFilterAll: sourceFilter === 'all',
    isLoading: snapshot.status === 'loading' || snapshot.status === 'idle',
    validEmpty,
  });

  return {
    trailPackRoutes,
    inventory,
    visibleCandidates,
    providerNotReadyCount,
    guidanceNotReadyCount,
    evaluatedCount,
    surface,
  };
}

(async () => {
  const criteria = {
    latitude: 38.9,
    longitude: -120.8,
    radiusMiles: 100,
    locationSource: 'live_gps',
    limit: 50,
  };
  const refreshKey = createLiveTrailPackCatalogRefreshKey(criteria);
  const secondPageBody = buildRouteCatalogSearchBody({
    ...criteria,
    page: 2,
    pageSize: 25,
  });
  assert.strictEqual(secondPageBody.limit, 25);
  assert.strictEqual(secondPageBody.page, 2);
  assert.strictEqual(secondPageBody.pageSize, 25);
  assert.strictEqual(secondPageBody.offset, 25);
  assert.notStrictEqual(
    createLiveTrailPackCatalogRefreshKey({ ...criteria, page: 1, pageSize: 25 }),
    createLiveTrailPackCatalogRefreshKey({ ...criteria, page: 2, pageSize: 25 }),
    'Page identity must participate in request deduplication and stale-response fingerprints.',
  );

  responses.push(searchResponse([routeRecord()], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'Source-backed ECS route catalog records match the current criteria.',
  }));

  const first = await refreshLiveTrailPackCatalog(criteria);
  assert.strictEqual(first.status, 'ready');
  assert.strictEqual(first.source, 'route_catalog');
  assert.strictEqual(first.refreshKey, refreshKey);
  assert.strictEqual(first.trailPacks.length, 1);
  assert.strictEqual(first.guidanceDiagnosticTrailPacks.length, 0);
  assert.strictEqual(first.preservedFromEmptyRefresh, false);

  const paginatedCriteria = {
    ...criteria,
    radiusMiles: 99,
    page: 2,
    pageSize: 25,
  };
  responses.push(searchResponse([routeRecord('second-page-route')], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'The second provider page completed.',
  }, [], {
    page: 2,
    pageSize: 25,
    offset: 25,
    hasMore: true,
    nextPage: 3,
    totalMatchedCount: 51,
    totalMatchedCountBounded: true,
  }));
  const secondPage = await refreshLiveTrailPackCatalog(paginatedCriteria);
  assert.strictEqual(secondPage.trailPacks[0].id, 'second-page-route');
  assert.strictEqual(secondPage.searchMeta.page, 2);
  assert.strictEqual(secondPage.searchMeta.pageSize, 25);
  assert.strictEqual(secondPage.searchMeta.offset, 25);
  assert.strictEqual(secondPage.searchMeta.hasMore, true);
  assert.strictEqual(secondPage.searchMeta.nextPage, 3);
  assert.strictEqual(secondPage.searchMeta.totalMatchedCount, 51);
  assert.strictEqual(secondPage.searchMeta.totalMatchedCountBounded, true);
  const secondPageInvocation = invocations.find(
    (entry) => entry.name === 'route-catalog-search' && entry.body.radiusMiles === 99,
  );
  assert(secondPageInvocation);
  assert.strictEqual(secondPageInvocation.body.page, 2);
  assert.strictEqual(secondPageInvocation.body.pageSize, 25);
  assert.strictEqual(secondPageInvocation.body.offset, 25);

  const legacyEventsBeforePaginationFailure = legacyQueryEvents.length;
  responses.push({ data: null, error: { message: 'Page provider unavailable.' } });
  const failedProviderPage = await refreshLiveTrailPackCatalog({
    ...criteria,
    radiusMiles: 97,
    page: 2,
    pageSize: 25,
  });
  assert.strictEqual(failedProviderPage.status, 'error');
  assert.strictEqual(failedProviderPage.source, 'unavailable');
  assert.strictEqual(failedProviderPage.asyncState.retryEligible, true);
  assert.strictEqual(
    legacyQueryEvents.length,
    legacyEventsBeforePaginationFailure,
    'A later provider page must not issue an unpageable legacy fallback request.',
  );

  const atomicBaseCriteria = {
    ...criteria,
    radiusMiles: 96,
    page: 1,
    pageSize: 25,
    limit: 25,
  };
  const atomicBaseKey = createLiveTrailPackCatalogRefreshKey(atomicBaseCriteria);
  responses.push(searchResponse([routeRecord('atomic-page-one-route')], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'The first atomic provider page completed.',
  }, [], {
    page: 1,
    pageSize: 25,
    offset: 0,
    hasMore: true,
    nextPage: 2,
    totalMatchedCount: 3,
    totalMatchedCountBounded: false,
  }));
  const atomicBase = await refreshLiveTrailPackCatalog(atomicBaseCriteria);
  assert.strictEqual(atomicBase.refreshKey, atomicBaseKey);

  const atomicPageEmissions = [];
  const unsubscribeAtomicPage = liveTrailPackCatalogStore.subscribe(() => {
    atomicPageEmissions.push(liveTrailPackCatalogStore.getSnapshot());
  });
  responses.push(searchResponse([routeRecord('atomic-page-two-route')], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'The second atomic provider page completed.',
  }, [], {
    page: 2,
    pageSize: 25,
    offset: 25,
    hasMore: true,
    nextPage: 3,
    totalMatchedCount: 3,
    totalMatchedCountBounded: false,
  }));
  const atomicSecondPage = await refreshLiveTrailPackCatalog({
    ...atomicBaseCriteria,
    page: 2,
  });
  unsubscribeAtomicPage();
  assert.deepStrictEqual(atomicSecondPage.trailPacks.map((route) => route.id), [
    'atomic-page-one-route',
    'atomic-page-two-route',
  ]);
  assert.strictEqual(atomicSecondPage.refreshKey, atomicBaseKey);
  assert.strictEqual(atomicSecondPage.searchMeta.page, 2);
  assert.strictEqual(atomicSecondPage.coverageState.state, 'ready');
  assert(
    atomicPageEmissions
      .filter((entry) => entry.status === 'loading')
      .every((entry) => entry.trailPacks.some((route) => route.id === 'atomic-page-one-route')),
    'Pagination loading emissions must preserve page-one data for every shared consumer.',
  );
  assert(
    !atomicPageEmissions.some((entry) =>
      entry.trailPacks.some((route) => route.id === 'atomic-page-two-route') &&
      !entry.trailPacks.some((route) => route.id === 'atomic-page-one-route')),
    'The shared store must never emit a page-only terminal snapshot.',
  );

  responses.push({ data: null, error: { message: 'Atomic page provider unavailable.' } });
  const atomicPageFailure = await refreshLiveTrailPackCatalog({
    ...atomicBaseCriteria,
    page: 3,
  });
  assert.strictEqual(atomicPageFailure.status, 'degraded');
  assert.strictEqual(atomicPageFailure.source, 'route_catalog');
  assert.strictEqual(atomicPageFailure.refreshKey, atomicBaseKey);
  assert.strictEqual(atomicPageFailure.preservedReason, 'pagination_page_unavailable');
  assert.strictEqual(atomicPageFailure.asyncState.safeErrorCode, 'ROUTE_CATALOG_PROVIDER_UNAVAILABLE');
  assert.strictEqual(atomicPageFailure.asyncState.retryEligible, true);
  assert.deepStrictEqual(atomicPageFailure.trailPacks.map((route) => route.id), [
    'atomic-page-one-route',
    'atomic-page-two-route',
  ]);

  responses.push(searchResponse([routeRecord('atomic-page-three-route')], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'The retried atomic provider page completed.',
  }, [], {
    page: 3,
    pageSize: 25,
    offset: 50,
    hasMore: false,
    nextPage: null,
    totalMatchedCount: 3,
    totalMatchedCountBounded: false,
  }));
  const atomicPageRetry = await refreshLiveTrailPackCatalog({
    ...atomicBaseCriteria,
    page: 3,
  });
  assert.strictEqual(atomicPageRetry.status, 'ready');
  assert.strictEqual(atomicPageRetry.error, null);
  assert.strictEqual(atomicPageRetry.asyncState.safeErrorCode, null);
  assert.strictEqual(atomicPageRetry.asyncState.retryEligible, false);
  assert.deepStrictEqual(atomicPageRetry.trailPacks.map((route) => route.id), [
    'atomic-page-one-route',
    'atomic-page-two-route',
    'atomic-page-three-route',
  ]);

  const atomicCancellationController = new AbortController();
  responses.push(new Promise(() => {}));
  const cancelledAtomicPageRequest = refreshLiveTrailPackCatalog({
    ...atomicBaseCriteria,
    page: 4,
  }, {
    signal: atomicCancellationController.signal,
    cancellationReason: 'unmount',
    timeoutMs: 100,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  atomicCancellationController.abort();
  const cancelledAtomicPage = await cancelledAtomicPageRequest;
  assert.strictEqual(cancelledAtomicPage.status, 'cancelled');
  assert.strictEqual(cancelledAtomicPage.refreshKey, atomicBaseKey);
  assert.strictEqual(cancelledAtomicPage.trailPacks.length, 3);
  assert.strictEqual(cancelledAtomicPage.asyncState.resultCount, 3);

  responses.push(new Promise(() => {}));
  const supersededAtomicPage = refreshLiveTrailPackCatalog({
    ...atomicBaseCriteria,
    page: 4,
  }, { timeoutMs: 100 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  responses.push(searchResponse([routeRecord('atomic-primary-retry-route')], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'The primary retry replaced the in-flight page request.',
  }, [], {
    page: 1,
    pageSize: 25,
    offset: 0,
    hasMore: false,
    nextPage: null,
    totalMatchedCount: 1,
    totalMatchedCountBounded: false,
  }));
  const atomicPrimaryRetry = await refreshLiveTrailPackCatalog(atomicBaseCriteria);
  await supersededAtomicPage;
  assert.strictEqual(atomicPrimaryRetry.status, 'ready');
  assert.deepStrictEqual(
    liveTrailPackCatalogStore.getSnapshot().trailPacks.map((route) => route.id),
    ['atomic-primary-retry-route'],
    'A superseded page request must not restore its old base over a newer primary retry.',
  );

  const mergeBaseKey = createLiveTrailPackCatalogRefreshKey({
    ...criteria,
    radiusMiles: 98,
    page: 1,
    pageSize: 25,
    limit: 25,
  });
  const mergePageKey = createLiveTrailPackCatalogRefreshKey({
    ...criteria,
    radiusMiles: 98,
    page: 2,
    pageSize: 25,
    limit: 25,
  });
  const baseDiagnostic = {
    routeId: 'base-diagnostic',
    publicId: 'base-diagnostic',
    name: 'Base diagnostic',
    exclusionReasons: ['access_unverified'],
    sourceTypes: ['official'],
    reviewStatus: 'approved',
    recommendationStatus: 'needs_review',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
  const updatedBaseRoute = { ...first.trailPacks[0], name: 'Updated duplicate route' };
  const mergeBaseData = {
    trailPacks: first.trailPacks,
    guidanceDiagnosticTrailPacks: [],
    guidanceDiagnosticRecords: [baseDiagnostic],
    routeCatalogSummaries: first.routeCatalogSummaries,
  };
  const mergePageData = {
    trailPacks: [updatedBaseRoute, secondPage.trailPacks[0]],
    guidanceDiagnosticTrailPacks: [],
    guidanceDiagnosticRecords: [
      { ...baseDiagnostic, name: 'Updated base diagnostic' },
      { ...baseDiagnostic, routeId: 'page-diagnostic', publicId: 'page-diagnostic' },
    ],
    routeCatalogSummaries: secondPage.routeCatalogSummaries,
  };
  const mergedPages = mergeLiveTrailPackCatalogPageSnapshots(
    {
      ...first,
      ...mergeBaseData,
      refreshKey: mergeBaseKey,
      searchMeta: {
        ...first.searchMeta,
        page: 1,
        pageSize: 25,
        offset: 0,
        hasMore: true,
        nextPage: 2,
        totalMatchedCount: 26,
        totalMatchedCountBounded: true,
      },
      asyncState: { ...first.asyncState, data: mergeBaseData, lastGoodData: mergeBaseData },
    },
    {
      ...secondPage,
      ...mergePageData,
      refreshKey: mergePageKey,
      searchMeta: {
        ...secondPage.searchMeta,
        page: 2,
        pageSize: 25,
        offset: 25,
        hasMore: false,
        nextPage: null,
        totalMatchedCount: 27,
        totalMatchedCountBounded: false,
      },
      asyncState: { ...secondPage.asyncState, data: mergePageData, lastGoodData: mergePageData },
    },
    mergeBaseKey,
  );
  assert.deepStrictEqual(mergedPages.trailPacks.map((route) => route.id), [
    'preserved-tahoe-route',
    'second-page-route',
  ]);
  assert.strictEqual(mergedPages.trailPacks[0].name, 'Updated duplicate route');
  assert.deepStrictEqual(mergedPages.guidanceDiagnosticRecords.map((diagnostic) => diagnostic.routeId), [
    'base-diagnostic',
    'page-diagnostic',
  ]);
  assert.strictEqual(mergedPages.guidanceDiagnosticRecords[0].name, 'Updated base diagnostic');
  assert.strictEqual(mergedPages.asyncState.lastGoodData.trailPacks.length, 2);
  assert.strictEqual(mergedPages.asyncState.resultCount, 4);
  assert.strictEqual(mergedPages.searchMeta.page, 2);
  assert.strictEqual(mergedPages.searchMeta.hasMore, false);
  assert.strictEqual(mergedPages.searchMeta.totalMatchedCount, 27);
  assert.strictEqual(mergedPages.refreshKey, mergeBaseKey);
  const persistentDegradedMerge = mergeLiveTrailPackCatalogPageSnapshots(
    {
      ...first,
      ...mergeBaseData,
      status: 'degraded',
      error: 'Page one excluded an invalid provider record.',
      refreshKey: mergeBaseKey,
      searchMeta: {
        ...first.searchMeta,
        page: 1,
        pageSize: 25,
        offset: 0,
        hasMore: true,
        nextPage: 2,
        clientInvalidRecordCount: 1,
      },
      asyncState: {
        ...first.asyncState,
        status: 'degraded',
        data: mergeBaseData,
        lastGoodData: mergeBaseData,
        freshness: 'recent',
        safeErrorCode: 'ROUTE_CATALOG_PARTIAL_INVALID_RESPONSE',
        retryEligible: true,
      },
    },
    {
      ...secondPage,
      ...mergePageData,
      refreshKey: mergePageKey,
      asyncState: { ...secondPage.asyncState, data: mergePageData, lastGoodData: mergePageData },
    },
    mergeBaseKey,
  );
  assert.strictEqual(persistentDegradedMerge.status, 'degraded');
  assert.strictEqual(
    persistentDegradedMerge.asyncState.safeErrorCode,
    'ROUTE_CATALOG_PARTIAL_INVALID_RESPONSE',
  );
  assert.strictEqual(persistentDegradedMerge.asyncState.retryEligible, true);
  assert.match(persistentDegradedMerge.error, /invalid provider record/i);
  assert.strictEqual(persistentDegradedMerge.coverageState.state, 'ready');
  const rejectedCrossQueryPage = mergeLiveTrailPackCatalogPageSnapshots(
    { ...first, refreshKey: mergeBaseKey },
    { ...secondPage, refreshKey: createLiveTrailPackCatalogRefreshKey({ ...criteria, radiusMiles: 97 }) },
    mergeBaseKey,
  );
  assert.deepStrictEqual(rejectedCrossQueryPage.trailPacks.map((route) => route.id), first.trailPacks.map((route) => route.id));

  const diagnosticCriteria = { ...criteria, radiusMiles: 104 };
  responses.push(searchResponse([
    {
      ...routeRecord('closed-guidance-diagnostic'),
      active_closure_count: 1,
    },
  ], {
    state: 'lower_confidence_nearby',
    title: 'Routes found but not guidance ready',
    message: 'Provider records were retained for exclusion diagnostics.',
  }, [{
    routeId: 'partner-guidance-diagnostic',
    publicId: 'partner-guidance-diagnostic',
    name: 'Restricted partner diagnostic',
    exclusionReasons: ['source_restricted'],
    sourceTypes: ['partner_restricted'],
    reviewStatus: 'approved',
    recommendationStatus: 'recommendable',
    updatedAt: '2026-06-02T00:00:00.000Z',
  }]));
  const diagnosticOnly = await refreshLiveTrailPackCatalog(diagnosticCriteria);
  assert.strictEqual(diagnosticOnly.status, 'ready');
  assert.strictEqual(diagnosticOnly.source, 'route_catalog');
  assert.strictEqual(diagnosticOnly.trailPacks.length, 0);
  assert.strictEqual(diagnosticOnly.routeCatalogSummaries.length, 0);
  assert.strictEqual(diagnosticOnly.guidanceDiagnosticTrailPacks.length, 1);
  assert.strictEqual(diagnosticOnly.guidanceDiagnosticRecords.length, 1);
  assert.strictEqual(diagnosticOnly.asyncState.resultCount, 2);
  assert.strictEqual(diagnosticOnly.asyncState.lastGoodData.guidanceDiagnosticTrailPacks.length, 1);
  assert.strictEqual(diagnosticOnly.asyncState.lastGoodData.guidanceDiagnosticRecords.length, 1);
  const closedDiagnostic = diagnosticOnly.guidanceDiagnosticTrailPacks.find(
    (trailPack) => trailPack.id === 'closed-guidance-diagnostic',
  );
  assert(closedDiagnostic?.routeGeometry, 'Non-partner diagnostics should retain geometry for typed safety checks.');
  assert.strictEqual(closedDiagnostic.catalogVerification.publicRecommendation, false);
  const partnerDiagnostic = diagnosticOnly.guidanceDiagnosticRecords.find(
    (diagnostic) => diagnostic.routeId === 'partner-guidance-diagnostic',
  );
  assert(partnerDiagnostic, 'Restricted partner records should remain only in the safe diagnostic collection.');
  assert.deepStrictEqual(partnerDiagnostic.exclusionReasons, ['source_restricted']);
  assert.deepStrictEqual(partnerDiagnostic.sourceTypes, ['partner_restricted']);
  assert(
    !JSON.stringify(partnerDiagnostic).includes('routeGeometry') &&
      !JSON.stringify(partnerDiagnostic).includes('coordinate'),
    'Restricted partner diagnostics should retain a safe source blocker without exposing geometry or coordinates.',
  );

  const safeDiagnosticOnlyCriteria = { ...criteria, radiusMiles: 104.5 };
  responses.push(searchResponse([], {
    state: 'lower_confidence_nearby',
    title: 'Routes found but not guidance ready',
    message: 'Only safe per-route exclusion diagnostics are available.',
  }, [{
    routeId: 'curation-only-route',
    publicId: 'curation-only-route',
    name: 'Curation-only route',
    exclusionReasons: ['access_unverified'],
    sourceTypes: ['official'],
    reviewStatus: 'approved',
    recommendationStatus: 'needs_review',
    updatedAt: '2026-06-02T00:00:00.000Z',
  }]));
  const safeDiagnosticOnly = await refreshLiveTrailPackCatalog(safeDiagnosticOnlyCriteria);
  assert.strictEqual(safeDiagnosticOnly.status, 'ready');
  assert.strictEqual(safeDiagnosticOnly.trailPacks.length, 0);
  assert.strictEqual(safeDiagnosticOnly.guidanceDiagnosticTrailPacks.length, 0);
  assert.strictEqual(safeDiagnosticOnly.guidanceDiagnosticRecords.length, 1);
  assert.strictEqual(safeDiagnosticOnly.asyncState.lastGoodData.guidanceDiagnosticRecords.length, 1);
  responses.push({
    data: null,
    error: { message: 'Provider unavailable after diagnostic-only success.' },
  });
  const staleSafeDiagnosticOnly = await refreshLiveTrailPackCatalog(safeDiagnosticOnlyCriteria);
  assert.strictEqual(staleSafeDiagnosticOnly.status, 'stale');
  assert.strictEqual(staleSafeDiagnosticOnly.guidanceDiagnosticRecords.length, 1);
  assert.strictEqual(staleSafeDiagnosticOnly.preservedReason, 'same_query_refresh_unavailable');
  assert.strictEqual(staleSafeDiagnosticOnly.asyncState.lastGoodData.guidanceDiagnosticRecords.length, 1);

  responses.push(searchResponse([], {
    state: 'no_verified_routes',
    title: 'No verified routes yet in this area',
    message: 'The provider completed successfully with no matching verified routes.',
  }));

  const validEmpty = await refreshLiveTrailPackCatalog(criteria);
  assert.strictEqual(validEmpty.status, 'empty');
  assert.strictEqual(validEmpty.source, 'route_catalog');
  assert.strictEqual(validEmpty.refreshKey, refreshKey);
  assert.strictEqual(validEmpty.trailPacks.length, 0);
  assert.strictEqual(validEmpty.guidanceDiagnosticTrailPacks.length, 0);
  assert.strictEqual(validEmpty.routeCatalogSummaries.length, 0);
  assert.strictEqual(validEmpty.preservedFromEmptyRefresh, false);
  assert.strictEqual(validEmpty.preservedReason, null);
  assert.strictEqual(validEmpty.error, null);
  assert.strictEqual(validEmpty.asyncState.status, 'empty');
  assert.strictEqual(validEmpty.asyncState.resultCount, 0);
  assert.strictEqual(validEmpty.asyncState.retryEligible, false);
  assert.strictEqual(validEmpty.asyncState.safeErrorCode, null);
  assert.strictEqual(validEmpty.asyncState.lastGoodData, null);

  const malformedPayloadCases = [
    { label: 'null payload', data: null, radiusMiles: 101 },
    { label: 'missing records envelope', data: {}, radiusMiles: 102 },
    { label: 'non-array records', data: { records: { id: 'not-an-array' } }, radiusMiles: 103 },
  ];
  for (const malformedCase of malformedPayloadCases) {
    responses.push({ data: malformedCase.data, error: null });
    const malformedResult = await refreshLiveTrailPackCatalog({
      ...criteria,
      radiusMiles: malformedCase.radiusMiles,
    });
    assert.strictEqual(
      malformedResult.status,
      'error',
      `${malformedCase.label} must not be reported as a valid empty result.`,
    );
    assert.strictEqual(malformedResult.source, 'unavailable');
    assert.strictEqual(malformedResult.trailPacks.length, 0);
    assert.strictEqual(malformedResult.routeCatalogSummaries.length, 0);
    assert.strictEqual(malformedResult.asyncState.safeErrorCode, 'ROUTE_CATALOG_INVALID_RESPONSE');
    assert.strictEqual(malformedResult.asyncState.retryEligible, true);
    assert.strictEqual(malformedResult.asyncState.lastGoodData, null);
  }

  responses.push(searchResponse([
    routeRecord('mixed-valid-route'),
    { id: 'mixed-invalid-route', name: 'Invalid route without geometry or center' },
  ], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'One valid route remains after invalid provider records are excluded.',
  }));
  const mixedMalformedResult = await refreshLiveTrailPackCatalog({
    ...criteria,
    radiusMiles: 104,
  });
  assert.strictEqual(mixedMalformedResult.status, 'degraded');
  assert.strictEqual(mixedMalformedResult.trailPacks.length, 1);
  assert.strictEqual(mixedMalformedResult.trailPacks[0].id, 'mixed-valid-route');
  assert.strictEqual(mixedMalformedResult.searchMeta.clientInvalidRecordCount, 1);
  assert.strictEqual(
    mixedMalformedResult.asyncState.safeErrorCode,
    'ROUTE_CATALOG_PARTIAL_INVALID_RESPONSE',
  );
  assert.strictEqual(mixedMalformedResult.asyncState.retryEligible, true);
  assert.match(mixedMalformedResult.error, /invalid and excluded/i);

  responses.push({
    data: null,
    error: { message: 'Provider unavailable after a confirmed empty result.' },
  });
  const failedAfterValidEmpty = await refreshLiveTrailPackCatalog(criteria);
  assert.strictEqual(failedAfterValidEmpty.status, 'error');
  assert.strictEqual(failedAfterValidEmpty.trailPacks.length, 0);
  assert.strictEqual(failedAfterValidEmpty.routeCatalogSummaries.length, 0);
  assert.strictEqual(failedAfterValidEmpty.asyncState.lastGoodData, null);
  assert.strictEqual(failedAfterValidEmpty.asyncState.safeErrorCode, 'ROUTE_CATALOG_PROVIDER_UNAVAILABLE');

  const emptyThenTimeoutCriteria = { ...criteria, radiusMiles: 41 };
  responses.push(searchResponse([], {
    state: 'no_verified_routes',
    title: 'No verified routes yet in this area',
    message: 'This successful empty result must not become last-good data.',
  }));
  const emptyBeforeTimeout = await refreshLiveTrailPackCatalog(emptyThenTimeoutCriteria);
  assert.strictEqual(emptyBeforeTimeout.status, 'empty');
  assert.strictEqual(emptyBeforeTimeout.asyncState.lastGoodData, null);
  responses.push(new Promise(() => {}));
  const timeoutAfterEmpty = await refreshLiveTrailPackCatalog(emptyThenTimeoutCriteria, { timeoutMs: 15 });
  assert.strictEqual(timeoutAfterEmpty.status, 'error');
  assert.strictEqual(timeoutAfterEmpty.asyncState.safeErrorCode, 'ROUTE_CATALOG_TIMEOUT');
  assert.strictEqual(timeoutAfterEmpty.asyncState.lastGoodData, null);
  assert.strictEqual(timeoutAfterEmpty.preservedFromEmptyRefresh, false);

  responses.push(searchResponse([], {
    state: 'no_verified_routes',
    title: 'No verified routes yet in this area',
    message: 'The empty state remains valid before a cancelled retry.',
  }));
  const emptyBeforeCancellation = await refreshLiveTrailPackCatalog(emptyThenTimeoutCriteria);
  assert.strictEqual(emptyBeforeCancellation.status, 'empty');
  const emptyCancellationController = new AbortController();
  responses.push(new Promise(() => {}));
  const cancellationAfterEmptyRequest = refreshLiveTrailPackCatalog(emptyThenTimeoutCriteria, {
    signal: emptyCancellationController.signal,
    cancellationReason: 'unmount',
    timeoutMs: 100,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  emptyCancellationController.abort();
  const cancellationAfterEmpty = await cancellationAfterEmptyRequest;
  assert.strictEqual(cancellationAfterEmpty.status, 'cancelled');
  assert.strictEqual(cancellationAfterEmpty.asyncState.lastGoodData, null);
  assert.strictEqual(cancellationAfterEmpty.preservedFromEmptyRefresh, false);

  const differentCriteria = { ...criteria, radiusMiles: 25 };
  const differentRefreshKey = createLiveTrailPackCatalogRefreshKey(differentCriteria);
  const differentQuerySnapshots = [];
  const unsubscribeDifferentQuery = liveTrailPackCatalogStore.subscribe(() => {
    differentQuerySnapshots.push(liveTrailPackCatalogStore.getSnapshot());
  });
  responses.push(searchResponse([], {
    state: 'no_verified_routes',
    title: 'No verified routes yet in this area',
    message: 'A different radius may truthfully have no matches.',
  }));

  const emptyDifferentSearch = await refreshLiveTrailPackCatalog(differentCriteria);
  unsubscribeDifferentQuery();
  assert.strictEqual(emptyDifferentSearch.status, 'empty');
  assert.strictEqual(emptyDifferentSearch.trailPacks.length, 0);
  assert.strictEqual(emptyDifferentSearch.preservedFromEmptyRefresh, false);
  assert.notStrictEqual(emptyDifferentSearch.refreshKey, refreshKey);
  assert(
    !differentQuerySnapshots.some((entry) =>
      entry.refreshKey === differentRefreshKey &&
      entry.routeCatalogSummaries.some((summary) => summary.routeId === 'preserved-tahoe-route'),
    ),
    'A cached summary from different search criteria must not flash into the active result list.',
  );

  const highLimitCriteria = {
    latitude: 38.78,
    longitude: -121.21,
    radiusMiles: 500,
    locationSource: 'live_gps',
    limit: 500,
  };
  const highLimitRefreshKey = createLiveTrailPackCatalogRefreshKey(highLimitCriteria);
  const stagedSnapshots = [];
  const unsubscribe = liveTrailPackCatalogStore.subscribe(() => {
    stagedSnapshots.push(liveTrailPackCatalogStore.getSnapshot());
  });

  responses.push(
    searchResponse([routeRecord('quick-norcal-route')], {
      state: 'ready',
      title: 'Verified routes available',
      message: 'Quick staged route catalog batch is available.',
    }),
    {
      data: null,
      error: { message: 'Verified route catalog timed out during full refresh.' },
    },
  );

  const stagedPreserved = await refreshLiveTrailPackCatalog(highLimitCriteria);
  unsubscribe();
  assert.strictEqual(stagedPreserved.status, 'stale');
  assert.strictEqual(stagedPreserved.source, 'route_catalog');
  assert.strictEqual(stagedPreserved.refreshKey, highLimitRefreshKey);
  assert.strictEqual(stagedPreserved.trailPacks.length, 1);
  assert.strictEqual(stagedPreserved.trailPacks[0].id, 'quick-norcal-route');
  assert.strictEqual(stagedPreserved.preservedFromEmptyRefresh, true);
  assert.strictEqual(stagedPreserved.preservedReason, 'same_query_refresh_unavailable');
  assert.match(String(stagedPreserved.error), /last known catalog/i);
  assert.strictEqual(stagedPreserved.asyncState.safeErrorCode, 'ROUTE_CATALOG_PROVIDER_UNAVAILABLE');
  assert(
    stagedSnapshots.some(
      (entry) =>
        entry.refreshKey === highLimitRefreshKey &&
        entry.status === 'loading' &&
        entry.trailPacks.length === 1 &&
        entry.preservedFromEmptyRefresh === false,
    ),
    'High-limit refresh should publish a quick staged route catalog snapshot before the full refresh completes.',
  );

  const concurrentCriteria = { ...criteria, radiusMiles: 42 };
  let resolveConcurrentRefresh;
  responses.push(new Promise((resolve) => {
    resolveConcurrentRefresh = resolve;
  }));
  const concurrentInvocationsBefore = invocations.length;
  const concurrentA = refreshLiveTrailPackCatalog(concurrentCriteria);
  const concurrentB = refreshLiveTrailPackCatalog(concurrentCriteria);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(
    invocations.length,
    concurrentInvocationsBefore + 1,
    'Equivalent concurrent route-catalog consumers should share one provider request.',
  );
  resolveConcurrentRefresh(searchResponse([routeRecord('shared-route')], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'Shared request completed.',
  }));
  const [concurrentResultA, concurrentResultB] = await Promise.all([concurrentA, concurrentB]);
  assert.strictEqual(concurrentResultA.status, 'ready');
  assert.strictEqual(concurrentResultB.status, 'ready');
  assert.strictEqual(concurrentResultA.trailPacks[0].id, 'shared-route');

  const sharedCancellationCriteria = { ...criteria, radiusMiles: 42.5 };
  let resolveSharedCancellationRefresh;
  responses.push(new Promise((resolve) => {
    resolveSharedCancellationRefresh = resolve;
  }));
  const sharedCancellationInvocationsBefore = invocations.length;
  const sharedCancellationController = new AbortController();
  const sharedCancelledConsumer = refreshLiveTrailPackCatalog(sharedCancellationCriteria, {
    signal: sharedCancellationController.signal,
    cancellationReason: 'unmount',
    timeoutMs: 100,
  });
  const sharedRemainingConsumer = refreshLiveTrailPackCatalog(sharedCancellationCriteria, { timeoutMs: 100 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const sharedProviderInvocation = invocations.find(
    (entry, index) => index >= sharedCancellationInvocationsBefore
      && entry.name === 'route-catalog-search'
      && entry.body.radiusMiles === 42.5,
  );
  assert(sharedProviderInvocation);
  sharedCancellationController.abort();
  await assert.rejects(
    sharedCancelledConsumer,
    (error) => error instanceof Error && error.name === 'AbortError',
    'An unmounted consumer should independently stop awaiting shared catalog work.',
  );
  assert.strictEqual(
    sharedProviderInvocation.signal.aborted,
    false,
    'One subscriber must not abort a provider request still owned by another subscriber.',
  );
  assert.strictEqual(
    invocations.length,
    sharedCancellationInvocationsBefore + 1,
    'Shared subscribers should issue one route-catalog request.',
  );
  resolveSharedCancellationRefresh(searchResponse([routeRecord('shared-after-unmount')], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'The remaining subscriber completed.',
  }));
  const sharedRemainingResult = await sharedRemainingConsumer;
  assert.strictEqual(sharedRemainingResult.status, 'ready');
  assert.strictEqual(sharedRemainingResult.trailPacks[0].id, 'shared-after-unmount');

  const rapidCriteriaA = { ...criteria, radiusMiles: 43 };
  const rapidCriteriaB = { ...criteria, radiusMiles: 44 };
  let resolveRapidA;
  responses.push(new Promise((resolve) => {
    resolveRapidA = resolve;
  }));
  const rapidA = refreshLiveTrailPackCatalog(rapidCriteriaA);
  await new Promise((resolve) => setTimeout(resolve, 0));
  responses.push(searchResponse([routeRecord('newest-route')], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'Newest request completed.',
  }));
  const rapidB = refreshLiveTrailPackCatalog(rapidCriteriaB);
  const rapidBResult = await rapidB;
  assert.strictEqual(rapidBResult.trailPacks[0].id, 'newest-route');
  resolveRapidA(searchResponse([routeRecord('stale-route')], {
    state: 'ready',
    title: 'Stale request',
    message: 'This response must be ignored.',
  }));
  const rapidAResult = await rapidA;
  assert.notStrictEqual(rapidAResult.trailPacks[0]?.id, 'stale-route');
  assert.strictEqual(liveTrailPackCatalogStore.getSnapshot().trailPacks[0].id, 'newest-route');

  const timeoutCriteria = { ...criteria, radiusMiles: 45 };
  responses.push(new Promise(() => {}));
  const timedOut = await refreshLiveTrailPackCatalog(timeoutCriteria, { timeoutMs: 15 });
  assert.strictEqual(timedOut.status, 'error');
  assert.strictEqual(timedOut.asyncState.safeErrorCode, 'ROUTE_CATALOG_TIMEOUT');
  assert.strictEqual(timedOut.asyncState.retryEligible, true);

  responses.push(searchResponse([routeRecord('retry-route')], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'Retry completed.',
  }));
  const retried = await refreshLiveTrailPackCatalog(timeoutCriteria, { timeoutMs: 100 });
  assert.strictEqual(retried.status, 'ready');
  assert.strictEqual(retried.trailPacks[0].id, 'retry-route');

  const fallbackCriteria = { ...criteria, radiusMiles: 47 };
  responses.push({
    data: null,
    error: { message: 'Verified route catalog temporarily unavailable.' },
  });
  legacyResponses.push({
    data: [
      { ...routeRecord('legacy-fallback-route'), source: 'ecs_submitted' },
      {
        ...routeRecord('out-of-area-legacy-route'),
        source: 'ecs_submitted',
        center_latitude: 40.015,
        center_longitude: -105.27,
      },
      { ...routeRecord('partner-restricted-legacy-route'), source: 'partner_source' },
    ],
    error: null,
  });
  const degradedFallback = await refreshLiveTrailPackCatalog(fallbackCriteria);
  assert.strictEqual(degradedFallback.status, 'degraded');
  assert.strictEqual(degradedFallback.source, 'trail_packs_fallback');
  assert.strictEqual(degradedFallback.trailPacks.length, 1);
  assert.strictEqual(degradedFallback.trailPacks[0].id, 'legacy-fallback-route');
  assert(
    !degradedFallback.trailPacks.some((pack) => pack.id === 'out-of-area-legacy-route'),
    'A scoped fallback must not present a global legacy row as an area match.',
  );
  assert(
    !degradedFallback.trailPacks.some((pack) => pack.id === 'partner-restricted-legacy-route'),
    'A partner-restricted fallback record must never be published to Explore.',
  );
  assert(
    legacyQueryEvents.some((event) =>
      event.type === 'neq' && event.column === 'source' && event.value === 'partner_source'),
    'The legacy fallback query must exclude partner-restricted source rows server-side.',
  );
  assert(
    legacyQueryEvents
      .filter((event) => event.type === 'select')
      .every((event) => !String(event.fields).includes('route_geometry')),
    'The mobile legacy fallback must not download full route geometry.',
  );
  assert.strictEqual(degradedFallback.asyncState.safeErrorCode, 'ROUTE_CATALOG_PRIMARY_UNAVAILABLE');
  assert.strictEqual(degradedFallback.asyncState.retryEligible, true);
  assert.strictEqual(degradedFallback.trailPacks[0].catalogVerification?.publicRecommendation, false);
  assert.match(
    degradedFallback.trailPacks[0].catalogVerification?.blockers.join(' ') ?? '',
    /verified route catalog evidence is unavailable/i,
  );
  assert.strictEqual(
    isPublicSuggestedTrailheadTrailPack(degradedFallback.trailPacks[0]),
    false,
    'A legacy fallback without catalog verification must not enter Guidance Ready.',
  );

  const cancellationCriteria = { ...criteria, radiusMiles: 46 };
  responses.push(new Promise(() => {}));
  const cancellationController = new AbortController();
  const cancellationRequest = refreshLiveTrailPackCatalog(cancellationCriteria, {
    signal: cancellationController.signal,
    cancellationReason: 'unmount',
    timeoutMs: 100,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  cancellationController.abort();
  const cancelled = await cancellationRequest;
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.strictEqual(cancelled.asyncState.cancellationReason, 'unmount');

  const permissionDenied = setLiveTrailPackCatalogDisabled({
    reason: 'permission_denied',
    safeErrorCode: 'EXPLORE_LOCATION_PERMISSION_DENIED',
    message: 'Location permission denied.',
  });
  assert.strictEqual(permissionDenied.status, 'disabled');
  assert.strictEqual(permissionDenied.asyncState.providerStatus, 'permission_denied');

  const detailPropagationRouteId = 'detail-propagation-route';
  const detailPropagationVersion = '2026-07-15T10:00:00.000Z';
  const detailPropagationCriteria = { ...criteria, radiusMiles: 47 };
  responses.push(searchResponse([
    lightweightRouteRecord(detailPropagationRouteId, {
      name: 'Detail propagation summary',
      updatedAt: detailPropagationVersion,
    }),
  ], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'A matching lightweight route is ready for detail hydration.',
  }));
  const detailPropagationSummary = await refreshLiveTrailPackCatalog(detailPropagationCriteria);
  const detailPropagationPack = detailPropagationSummary.trailPacks.find(
    (trailPack) => trailPack.id === detailPropagationRouteId,
  );
  assert(detailPropagationPack);
  assert.strictEqual(detailPropagationPack.routeGeometry, undefined);

  let detailPropagationEmissions = 0;
  const unsubscribeDetailPropagation = liveTrailPackCatalogStore.subscribe(() => {
    detailPropagationEmissions += 1;
  });
  responses.push({
    data: {
      record: {
        ...routeRecord(detailPropagationRouteId),
        name: 'Hydrated detail propagation route',
        updated_at: detailPropagationVersion,
      },
    },
    error: null,
  });
  await fetchRouteCatalogTrailPackDetail(detailPropagationPack, {
    sourceVersion: detailPropagationVersion,
  });
  unsubscribeDetailPropagation();

  const reconciledDetailSnapshot = liveTrailPackCatalogStore.getSnapshot();
  const reconciledDetailPack = reconciledDetailSnapshot.trailPacks.find(
    (trailPack) => trailPack.id === detailPropagationRouteId,
  );
  assert(reconciledDetailPack?.routeGeometry, 'Full detail geometry must reconcile into the current catalog route.');
  assert.strictEqual(reconciledDetailPack.name, 'Hydrated detail propagation route');
  assert.strictEqual(
    reconciledDetailSnapshot.asyncState.data?.trailPacks.find(
      (trailPack) => trailPack.id === detailPropagationRouteId,
    )?.routeGeometry?.type,
    'LineString',
    'The current async presentation data must receive the reconciled geometry.',
  );
  assert.strictEqual(
    reconciledDetailSnapshot.asyncState.lastGoodData?.trailPacks.find(
      (trailPack) => trailPack.id === detailPropagationRouteId,
    )?.routeGeometry?.type,
    'LineString',
    'Last-good catalog data must receive the same reconciled geometry.',
  );
  assert.strictEqual(
    detailPropagationEmissions,
    1,
    'One normalized detail completion must emit exactly one catalog update.',
  );

  const staleIdentityRouteId = 'stale-detail-refresh-identity-route';
  const staleIdentityVersion = '2026-07-15T11:00:00.000Z';
  const staleIdentityCriteria = { ...criteria, radiusMiles: 48 };
  responses.push(searchResponse([
    lightweightRouteRecord(staleIdentityRouteId, {
      name: 'Original viewport summary',
      updatedAt: staleIdentityVersion,
    }),
  ], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'The original viewport contains the route.',
  }));
  const staleIdentitySummary = await refreshLiveTrailPackCatalog(staleIdentityCriteria);
  const staleIdentityPack = staleIdentitySummary.trailPacks.find(
    (trailPack) => trailPack.id === staleIdentityRouteId,
  );
  assert(staleIdentityPack);

  let resolveStaleIdentityDetail;
  responses.push(new Promise((resolve) => {
    resolveStaleIdentityDetail = resolve;
  }));
  const staleIdentityDetailRequest = fetchRouteCatalogTrailPackDetail(staleIdentityPack, {
    sourceVersion: staleIdentityVersion,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const replacementIdentityCriteria = { ...criteria, radiusMiles: 49 };
  responses.push(searchResponse([
    lightweightRouteRecord(staleIdentityRouteId, {
      name: 'Replacement viewport summary',
      updatedAt: staleIdentityVersion,
    }),
  ], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'A newer viewport refresh owns the current route.',
  }));
  await refreshLiveTrailPackCatalog(replacementIdentityCriteria);

  let staleIdentityDetailEmissions = 0;
  const unsubscribeStaleIdentityDetail = liveTrailPackCatalogStore.subscribe(() => {
    staleIdentityDetailEmissions += 1;
  });
  resolveStaleIdentityDetail({
    data: {
      record: {
        ...routeRecord(staleIdentityRouteId),
        name: 'Obsolete original viewport detail',
        updated_at: staleIdentityVersion,
      },
    },
    error: null,
  });
  await staleIdentityDetailRequest;
  unsubscribeStaleIdentityDetail();

  const afterStaleIdentityDetail = liveTrailPackCatalogStore.getSnapshot();
  const currentIdentityPack = afterStaleIdentityDetail.trailPacks.find(
    (trailPack) => trailPack.id === staleIdentityRouteId,
  );
  assert.strictEqual(currentIdentityPack?.name, 'Replacement viewport summary');
  assert.strictEqual(currentIdentityPack?.routeGeometry, undefined);
  assert.strictEqual(
    staleIdentityDetailEmissions,
    0,
    'A detail response from an older refresh identity must not emit or overwrite the current catalog.',
  );

  const staleVersionRouteId = 'stale-detail-source-version-route';
  const currentSourceVersion = '2026-07-15T12:00:00.000Z';
  const staleSourceVersion = '2026-07-15T11:59:00.000Z';
  responses.push(searchResponse([
    lightweightRouteRecord(staleVersionRouteId, {
      name: 'Current source-version summary',
      updatedAt: currentSourceVersion,
    }),
  ], {
    state: 'ready',
    title: 'Verified routes available',
    message: 'The latest source version owns the current route.',
  }));
  await refreshLiveTrailPackCatalog({ ...criteria, radiusMiles: 50 });

  let staleVersionEmissions = 0;
  const unsubscribeStaleVersion = liveTrailPackCatalogStore.subscribe(() => {
    staleVersionEmissions += 1;
  });
  responses.push({
    data: {
      record: {
        ...routeRecord(staleVersionRouteId),
        name: 'Obsolete source-version detail',
        updated_at: staleSourceVersion,
      },
    },
    error: null,
  });
  await fetchRouteCatalogTrailPackDetail(staleVersionRouteId, {
    sourceVersion: staleSourceVersion,
  });
  unsubscribeStaleVersion();

  const afterStaleVersionDetail = liveTrailPackCatalogStore.getSnapshot();
  const currentVersionPack = afterStaleVersionDetail.trailPacks.find(
    (trailPack) => trailPack.id === staleVersionRouteId,
  );
  assert.strictEqual(currentVersionPack?.name, 'Current source-version summary');
  assert.strictEqual(currentVersionPack?.routeGeometry, undefined);
  assert.strictEqual(
    staleVersionEmissions,
    0,
    'A mismatched detail source version must not emit or overwrite the current route.',
  );

  let resolveDetailRequest;
  responses.push(new Promise((resolve) => {
    resolveDetailRequest = resolve;
  }));
  const detailRubiconInvocationsBefore = invocations.filter(
    (entry) => entry.name === 'route-catalog-detail',
  ).length;
  const detailRequestA = fetchRouteCatalogTrailPackDetail('detail-rubicon-route');
  const detailRequestB = fetchRouteCatalogTrailPackDetail('detail-rubicon-route');
  assert.strictEqual(
    invocations.filter((entry) => entry.name === 'route-catalog-detail').length,
    detailRubiconInvocationsBefore + 1,
    'Concurrent detail actions should share one provider request.',
  );
  resolveDetailRequest({ data: { record: routeRecord('detail-rubicon-route') }, error: null });
  const [detailA, detailB] = await Promise.all([detailRequestA, detailRequestB]);
  assert.strictEqual(detailA.id, 'detail-rubicon-route');
  assert.strictEqual(detailB.id, 'detail-rubicon-route');
  await fetchRouteCatalogTrailPackDetail('detail-rubicon-route');
  assert.strictEqual(
    invocations.filter((entry) => entry.name === 'route-catalog-detail').length,
    detailRubiconInvocationsBefore + 1,
    'A warm bounded detail cache should avoid an immediate duplicate provider request.',
  );
  assert.strictEqual(
    getCachedRouteCatalogTrailPackDetail('detail-rubicon-route')?.id,
    'detail-rubicon-route',
    'Trip Builder must be able to read the reconciled bounded detail cache without issuing a provider call.',
  );

  let resolveSharedDetailRequest;
  responses.push(new Promise((resolve) => {
    resolveSharedDetailRequest = resolve;
  }));
  const sharedDetailInvocationsBefore = invocations.filter((entry) => entry.name === 'route-catalog-detail').length;
  const sharedDetailController = new AbortController();
  const sharedCancelledDetail = fetchRouteCatalogTrailPackDetail('shared-detail-route', {
    signal: sharedDetailController.signal,
    cancellationReason: 'unmount',
    sourceVersion: '2026-07-15T10:00:00.000Z',
    timeoutMs: 100,
  });
  const sharedRemainingDetail = fetchRouteCatalogTrailPackDetail('shared-detail-route', {
    sourceVersion: '2026-07-15T10:00:00.000Z',
    timeoutMs: 100,
  });
  const sharedDetailInvocation = invocations.filter((entry) => entry.name === 'route-catalog-detail').at(-1);
  sharedDetailController.abort();
  await assert.rejects(
    sharedCancelledDetail,
    (error) => error instanceof Error && error.name === 'AbortError',
    'An unmounted detail consumer should detach without cancelling another consumer.',
  );
  assert.strictEqual(sharedDetailInvocation.signal.aborted, false);
  assert.strictEqual(
    invocations.filter((entry) => entry.name === 'route-catalog-detail').length,
    sharedDetailInvocationsBefore + 1,
  );
  resolveSharedDetailRequest({ data: { record: routeRecord('shared-detail-route') }, error: null });
  const sharedRemainingDetailResult = await sharedRemainingDetail;
  assert.strictEqual(sharedRemainingDetailResult.id, 'shared-detail-route');

  const versionedRouteId = 'versioned-detail-route';
  const versionedInvocationsBefore = invocations.filter((entry) => entry.name === 'route-catalog-detail').length;
  responses.push({
    data: { record: { ...routeRecord(versionedRouteId), name: 'Version one detail' } },
    error: null,
  });
  const versionOne = await fetchRouteCatalogTrailPackDetail(versionedRouteId, { sourceVersion: 'v1' });
  assert.strictEqual(versionOne.name, 'Version one detail');
  await fetchRouteCatalogTrailPackDetail(versionedRouteId, { sourceVersion: 'v1' });
  assert.strictEqual(
    invocations.filter((entry) => entry.name === 'route-catalog-detail').length,
    versionedInvocationsBefore + 1,
    'The same route/source version should reuse its detail cache.',
  );
  responses.push({
    data: { record: { ...routeRecord(versionedRouteId), name: 'Version two detail' } },
    error: null,
  });
  const versionTwo = await fetchRouteCatalogTrailPackDetail(versionedRouteId, { sourceVersion: 'v2' });
  assert.strictEqual(versionTwo.name, 'Version two detail');
  assert.strictEqual(
    invocations.filter((entry) => entry.name === 'route-catalog-detail').length,
    versionedInvocationsBefore + 2,
    'A changed source version must not reuse stale route detail.',
  );

  const invalidatedRouteId = 'invalidated-detail-route';
  let resolveInvalidatedOldRequest;
  responses.push(new Promise((resolve) => {
    resolveInvalidatedOldRequest = resolve;
  }));
  const invalidatedOldRequest = fetchRouteCatalogTrailPackDetail(invalidatedRouteId, { sourceVersion: 'v1' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  invalidateRouteCatalogTrailPackDetail(invalidatedRouteId);
  await assert.rejects(
    invalidatedOldRequest,
    (error) => error instanceof Error && error.name === 'AbortError',
    'Invalidation must abort an in-flight detail generation.',
  );
  responses.push({
    data: { record: { ...routeRecord(invalidatedRouteId), name: 'Fresh post-invalidation detail' } },
    error: null,
  });
  const invalidatedFreshResult = await fetchRouteCatalogTrailPackDetail(invalidatedRouteId, {
    sourceVersion: 'v1',
  });
  assert.strictEqual(invalidatedFreshResult.name, 'Fresh post-invalidation detail');
  resolveInvalidatedOldRequest({
    data: { record: { ...routeRecord(invalidatedRouteId), name: 'Obsolete pre-invalidation detail' } },
    error: null,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const invalidatedCachedResult = await fetchRouteCatalogTrailPackDetail(invalidatedRouteId, {
    sourceVersion: 'v1',
  });
  assert.strictEqual(
    invalidatedCachedResult.name,
    'Fresh post-invalidation detail',
    'An obsolete in-flight generation must not repopulate the detail cache.',
  );

  responses.push(new Promise(() => {}));
  await assert.rejects(
    fetchRouteCatalogTrailPackDetail('timed-out-detail', { timeoutMs: 15 }),
    (error) => error instanceof Error && error.name === 'TimeoutError',
    'A hung route detail request should time out and leave the pending map retryable.',
  );
  responses.push({ data: { record: routeRecord('timed-out-detail') }, error: null });
  const retriedDetail = await fetchRouteCatalogTrailPackDetail('timed-out-detail', { timeoutMs: 100 });
  assert.strictEqual(retriedDetail.id, 'timed-out-detail');

  // Production-path Explorer state matrix using the privacy-scanned response
  // captured after the nearby-route RPC migration. The fixture intentionally
  // contains no coordinates, route geometry, private source identity, or auth.
  assert.strictEqual(postMigrationLiveFixture.records.length, 50);
  assert.strictEqual(postMigrationLiveFixture.diagnosticRecords.length, 0);
  assert.strictEqual(postMigrationLiveFixture.meta.anySourceBackedCandidateCount, 51);

  // A: a fresh revealable response renders cards even though every summary
  // defers full guidance geometry until selection.
  const matrixFreshCriteria = { ...criteria, radiusMiles: 500, limit: 50 };
  const matrixFreshKey = createLiveTrailPackCatalogRefreshKey(matrixFreshCriteria);
  responses.push(fixtureResponse());
  const matrixFresh = await refreshLiveTrailPackCatalog(matrixFreshCriteria);
  const matrixFreshSurface = buildProductionExploreSurface(matrixFresh, matrixFreshKey);
  assert.strictEqual(matrixFresh.status, 'ready');
  assert.strictEqual(matrixFresh.source, 'route_catalog');
  assert.strictEqual(matrixFresh.trailPacks.length, 50);
  assert.strictEqual(matrixFreshSurface.inventory.totalDiscoverableCount, 50);
  assert.strictEqual(matrixFreshSurface.inventory.totalReadyCount, 0);
  assert.strictEqual(matrixFreshSurface.visibleCandidates.length, 50);
  assert.strictEqual(matrixFreshSurface.surface.kind, 'cards');
  assert.strictEqual(matrixFreshSurface.surface.currentSuccessfulEvaluation, true);
  assert.strictEqual(matrixFreshSurface.surface.showBlockedNotice, false);
  assert.strictEqual(
    matrixFreshSurface.providerNotReadyCount,
    0,
    'The 51st pagination lookahead row is not a materialized blocked record.',
  );
  assert.strictEqual(matrixFresh.searchMeta.anySourceBackedCandidateCount, 51);
  assert.strictEqual(matrixFresh.searchMeta.pageSize, 50);
  const freshAvailability = matrixFreshSurface.trailPackRoutes.map(classifyExploreRouteAvailability);
  assert.strictEqual(freshAvailability.filter((entry) => entry.discoverability.eligible).length, 50);
  assert.strictEqual(freshAvailability.filter((entry) => entry.tripBuilder.eligible).length, 50);

  // H: an approved short route remains discoverable and Trip Builder eligible;
  // the five-mile threshold only prevents immediate guidance readiness.
  const shortRoute = matrixFreshSurface.trailPackRoutes.find(
    (route) => Number(route.distanceMiles) > 0 && Number(route.distanceMiles) < 5,
  );
  assert(shortRoute, 'The sanitized live fixture must retain an approved short-route example.');
  const shortRouteAvailability = classifyExploreRouteAvailability(shortRoute);
  assert.strictEqual(shortRouteAvailability.discoverability.eligible, true);
  assert.strictEqual(shortRouteAvailability.tripBuilder.eligible, true);
  assert.strictEqual(shortRouteAvailability.guidance.eligible, false);
  assert(shortRouteAvailability.guidance.exclusionCodes.includes('too_short'));

  // F: clear the active query without clearing persistence, then prove a 503
  // hydrates the revealable v1 summary cache and keeps stale cards visible.
  responses.push({ data: null, error: { message: '503 reset query unavailable', status: 503 } });
  await refreshLiveTrailPackCatalog({ ...criteria, radiusMiles: 492, limit: 50 });
  const matrixStaleRevealableEmissions = [];
  const unsubscribeMatrixStaleRevealable = liveTrailPackCatalogStore.subscribe(() => {
    const emitted = liveTrailPackCatalogStore.getSnapshot();
    if (emitted.refreshKey === matrixFreshKey) matrixStaleRevealableEmissions.push(emitted);
  });
  responses.push({ data: null, error: { message: '503 route catalog unavailable', status: 503 } });
  const matrixStaleRevealable = await refreshLiveTrailPackCatalog(matrixFreshCriteria);
  unsubscribeMatrixStaleRevealable();
  const matrixStaleRevealableSurface = buildProductionExploreSurface(
    matrixStaleRevealable,
    matrixFreshKey,
  );
  assert.strictEqual(matrixStaleRevealable.status, 'stale');
  assert.strictEqual(matrixStaleRevealable.asyncState.providerStatus, 'unavailable');
  assert.strictEqual(matrixStaleRevealable.trailPacks.length, 0);
  assert.strictEqual(matrixStaleRevealable.routeCatalogSummaries.length, 50);
  assert.strictEqual(matrixStaleRevealableSurface.visibleCandidates.length, 50);
  assert.strictEqual(matrixStaleRevealableSurface.surface.kind, 'cards');
  assert.strictEqual(matrixStaleRevealableSurface.surface.currentSuccessfulEvaluation, false);
  assert.strictEqual(matrixStaleRevealableSurface.surface.showBlockedNotice, false);
  assert(
    matrixStaleRevealableEmissions.some((emitted) =>
      emitted.status === 'loading' &&
      emitted.asyncState.source === 'cached' &&
      emitted.routeCatalogSummaries.length === 50),
    'Scenario F must hydrate revealable route summaries from persisted cache during revalidation.',
  );
  assert(
    matrixStaleRevealableEmissions.every((emitted) =>
      buildProductionExploreSurface(emitted, matrixFreshKey).surface.kind !== 'blocked'),
    'Scenario F must never emit a transient blocked surface while cached cards revalidate.',
  );

  // B: revealable routes win over simultaneous legitimate exclusion
  // diagnostics. The blocked count remains informational beside visible cards.
  const matrixMixedCriteria = { ...criteria, radiusMiles: 499, limit: 50 };
  const matrixMixedKey = createLiveTrailPackCatalogRefreshKey(matrixMixedCriteria);
  const mixedDiagnostic = safeDiagnosticRecord('mixed-access-diagnostic');
  responses.push(fixtureResponse({
    records: [postMigrationLiveFixture.records[0]],
    diagnosticRecords: [mixedDiagnostic],
    count: 1,
    meta: {
      candidateLimit: 2,
      candidateCount: 2,
      spatialIndexCandidateCount: 2,
      radiusMatchedCount: 2,
      centerMatchedCount: 2,
      curationCandidateCount: 1,
      safeDiagnosticCount: 1,
      anySourceBackedCandidateCount: 2,
      returnedCount: 1,
      hasMore: false,
      nextPage: null,
      totalMatchedCount: 2,
      totalMatchedCountBounded: false,
    },
  }));
  const matrixMixed = await refreshLiveTrailPackCatalog(matrixMixedCriteria);
  const matrixMixedSurface = buildProductionExploreSurface(matrixMixed, matrixMixedKey);
  assert.strictEqual(matrixMixed.trailPacks.length, 1);
  assert.strictEqual(matrixMixed.guidanceDiagnosticRecords.length, 1);
  assert.strictEqual(matrixMixedSurface.providerNotReadyCount, 1);
  assert.strictEqual(matrixMixedSurface.visibleCandidates.length, 1);
  assert.strictEqual(matrixMixedSurface.surface.kind, 'cards');
  assert.strictEqual(matrixMixedSurface.surface.showBlockedNotice, false);

  // C: a fresh, current, successful diagnostic-only response with a legitimate
  // access exclusion is the one state allowed to render policy-blocked copy.
  const matrixBlockedCriteria = { ...criteria, radiusMiles: 498, limit: 50 };
  const matrixBlockedKey = createLiveTrailPackCatalogRefreshKey(matrixBlockedCriteria);
  const blockedDiagnostic = safeDiagnosticRecord('blocked-access-diagnostic');
  responses.push(fixtureResponse({
    records: [],
    diagnosticRecords: [blockedDiagnostic],
    count: 0,
    meta: {
      candidateLimit: 1,
      candidateCount: 1,
      spatialIndexCandidateCount: 1,
      radiusMatchedCount: 1,
      centerMatchedCount: 1,
      curationCandidateCount: 1,
      safeDiagnosticCount: 1,
      anySourceBackedCandidateCount: 1,
      returnedCount: 0,
      hasMore: false,
      nextPage: null,
      totalMatchedCount: 1,
      totalMatchedCountBounded: false,
    },
  }));
  const matrixBlocked = await refreshLiveTrailPackCatalog(matrixBlockedCriteria);
  const matrixBlockedSurface = buildProductionExploreSurface(matrixBlocked, matrixBlockedKey);
  assert.strictEqual(matrixBlocked.status, 'ready');
  assert.strictEqual(matrixBlocked.trailPacks.length, 0);
  assert.strictEqual(matrixBlocked.guidanceDiagnosticRecords.length, 1);
  assert.deepStrictEqual(matrixBlocked.guidanceDiagnosticRecords[0].exclusionReasons, [
    'access_unverified',
  ]);
  assert.strictEqual(matrixBlockedSurface.providerNotReadyCount, 1);
  assert.strictEqual(matrixBlockedSurface.evaluatedCount, 1);
  assert.strictEqual(matrixBlockedSurface.surface.kind, 'blocked');
  assert.strictEqual(matrixBlockedSurface.surface.currentSuccessfulEvaluation, true);
  assert.strictEqual(matrixBlockedSurface.surface.showBlockedNotice, true);

  // E: the same diagnostic-only last-good data after a 503 is stale provider
  // evidence, never a fresh policy-blocked conclusion.
  responses.push({ data: null, error: { message: '503 route catalog unavailable', status: 503 } });
  const matrixStaleBlocked = await refreshLiveTrailPackCatalog(matrixBlockedCriteria);
  const matrixStaleBlockedSurface = buildProductionExploreSurface(
    matrixStaleBlocked,
    matrixBlockedKey,
  );
  assert.strictEqual(matrixStaleBlocked.status, 'stale');
  assert.strictEqual(matrixStaleBlocked.guidanceDiagnosticRecords.length, 1);
  assert.strictEqual(matrixStaleBlocked.asyncState.providerStatus, 'unavailable');
  assert.strictEqual(matrixStaleBlockedSurface.surface.kind, 'stale');
  assert.strictEqual(matrixStaleBlockedSurface.surface.currentSuccessfulEvaluation, false);
  assert.strictEqual(matrixStaleBlockedSurface.surface.showBlockedNotice, false);

  // E persisted-cache variant: create a blocked fallback summary, leave it in
  // the v1 persisted adapter, remove the active in-memory query, then revalidate
  // through a provider 503. Neither cached/loading nor terminal stale may claim
  // a current successful policy evaluation.
  const matrixPersistedBlockedCriteria = { ...criteria, radiusMiles: 495, limit: 50 };
  const matrixPersistedBlockedKey = createLiveTrailPackCatalogRefreshKey(
    matrixPersistedBlockedCriteria,
  );
  const persistedBlockedRouteId = 'persisted-blocked-fallback-route';
  responses.push({ data: null, error: { message: '503 route catalog unavailable', status: 503 } });
  legacyResponses.push({
    data: [{ ...routeRecord(persistedBlockedRouteId), source: 'ecs_submitted' }],
    error: null,
  });
  const matrixPersistedBlockedSeed = await refreshLiveTrailPackCatalog(
    matrixPersistedBlockedCriteria,
  );
  assert.strictEqual(matrixPersistedBlockedSeed.source, 'trail_packs_fallback');
  const summaryCacheAdapter = memoryCaches.get('explore.catalog.summary.v1');
  assert(summaryCacheAdapter, 'The v1 persisted summary cache adapter must be initialized.');
  const persistedBlockedRaw = summaryCacheAdapter.get('explore.catalog.summary.v1');
  assert(persistedBlockedRaw, 'The blocked fallback summary must be persisted before revalidation.');
  const persistedBlockedPayload = JSON.parse(persistedBlockedRaw);
  assert.strictEqual(persistedBlockedPayload.refreshKey, matrixPersistedBlockedKey);
  assert.strictEqual(persistedBlockedPayload.source, 'trail_packs_fallback');
  assert(
    persistedBlockedPayload.summaries.some((summary) => summary.routeId === persistedBlockedRouteId),
  );

  responses.push({ data: null, error: { message: '503 reset query unavailable', status: 503 } });
  await refreshLiveTrailPackCatalog({ ...criteria, radiusMiles: 494, limit: 50 });
  const matrixPersistedBlockedEmissions = [];
  const unsubscribeMatrixPersistedBlocked = liveTrailPackCatalogStore.subscribe(() => {
    const emitted = liveTrailPackCatalogStore.getSnapshot();
    if (emitted.refreshKey === matrixPersistedBlockedKey) {
      matrixPersistedBlockedEmissions.push(emitted);
    }
  });
  responses.push({ data: null, error: { message: '503 route catalog unavailable', status: 503 } });
  const matrixPersistedBlocked = await refreshLiveTrailPackCatalog(
    matrixPersistedBlockedCriteria,
  );
  unsubscribeMatrixPersistedBlocked();
  const matrixPersistedBlockedSurface = buildProductionExploreSurface(
    matrixPersistedBlocked,
    matrixPersistedBlockedKey,
  );
  assert.strictEqual(matrixPersistedBlocked.status, 'stale');
  assert.strictEqual(matrixPersistedBlocked.asyncState.source, 'cached');
  assert.strictEqual(matrixPersistedBlocked.routeCatalogSummaries.length, 1);
  assert.strictEqual(matrixPersistedBlockedSurface.visibleCandidates.length, 0);
  assert(matrixPersistedBlockedSurface.evaluatedCount > 0);
  assert.strictEqual(matrixPersistedBlockedSurface.surface.kind, 'stale');
  assert.strictEqual(matrixPersistedBlockedSurface.surface.currentSuccessfulEvaluation, false);
  assert.strictEqual(matrixPersistedBlockedSurface.surface.showBlockedNotice, false);
  assert(
    matrixPersistedBlockedEmissions.some((emitted) =>
      emitted.status === 'loading' &&
      emitted.asyncState.source === 'cached' &&
      emitted.routeCatalogSummaries.length === 1),
    'Scenario E must hydrate the blocked fallback summary from persisted cache.',
  );
  assert(
    matrixPersistedBlockedEmissions.every((emitted) =>
      buildProductionExploreSurface(emitted, matrixPersistedBlockedKey).surface.kind !== 'blocked'),
    'Scenario E must never emit blocked during persisted-cache revalidation.',
  );

  // G: a fresh response for a query that previously persisted a blocked legacy
  // fallback replaces the old cache/in-memory inventory atomically.
  const matrixReplacementCriteria = { ...criteria, radiusMiles: 497, limit: 50 };
  const matrixReplacementKey = createLiveTrailPackCatalogRefreshKey(matrixReplacementCriteria);
  const matrixReplacementFallbackRouteId = 'old-blocked-fallback-route';
  responses.push({ data: null, error: { message: '503 route catalog unavailable', status: 503 } });
  legacyResponses.push({
    data: [{ ...routeRecord(matrixReplacementFallbackRouteId), source: 'ecs_submitted' }],
    error: null,
  });
  const matrixOldFallback = await refreshLiveTrailPackCatalog(matrixReplacementCriteria);
  const matrixOldFallbackSurface = buildProductionExploreSurface(
    matrixOldFallback,
    matrixReplacementKey,
  );
  assert.strictEqual(matrixOldFallback.status, 'degraded');
  assert.strictEqual(matrixOldFallback.source, 'trail_packs_fallback');
  assert.strictEqual(matrixOldFallbackSurface.visibleCandidates.length, 0);
  assert.strictEqual(matrixOldFallbackSurface.surface.kind, 'stale');
  assert.strictEqual(matrixOldFallbackSurface.surface.showBlockedNotice, false);
  const matrixOldFallbackRaw = summaryCacheAdapter.get('explore.catalog.summary.v1');
  assert(matrixOldFallbackRaw);
  const matrixOldFallbackPayload = JSON.parse(matrixOldFallbackRaw);
  assert.strictEqual(matrixOldFallbackPayload.refreshKey, matrixReplacementKey);
  assert.strictEqual(matrixOldFallbackPayload.source, 'trail_packs_fallback');
  assert(
    matrixOldFallbackPayload.summaries.some(
      (summary) => summary.routeId === matrixReplacementFallbackRouteId,
    ),
  );
  responses.push(fixtureResponse());
  const matrixFreshReplacement = await refreshLiveTrailPackCatalog(matrixReplacementCriteria);
  const matrixFreshReplacementSurface = buildProductionExploreSurface(
    matrixFreshReplacement,
    matrixReplacementKey,
  );
  assert.strictEqual(matrixFreshReplacement.status, 'ready');
  assert.strictEqual(matrixFreshReplacement.source, 'route_catalog');
  assert.strictEqual(matrixFreshReplacement.trailPacks.length, 50);
  assert.strictEqual(matrixFreshReplacement.guidanceDiagnosticTrailPacks.length, 0);
  assert.strictEqual(matrixFreshReplacement.guidanceDiagnosticRecords.length, 0);
  assert.strictEqual(matrixFreshReplacementSurface.visibleCandidates.length, 50);
  assert.strictEqual(matrixFreshReplacementSurface.surface.kind, 'cards');
  assert.strictEqual(matrixFreshReplacementSurface.surface.currentSuccessfulEvaluation, true);
  const matrixFreshReplacementRaw = summaryCacheAdapter.get('explore.catalog.summary.v1');
  assert(matrixFreshReplacementRaw);
  const matrixFreshReplacementPayload = JSON.parse(matrixFreshReplacementRaw);
  assert.strictEqual(matrixFreshReplacementPayload.refreshKey, matrixReplacementKey);
  assert.strictEqual(matrixFreshReplacementPayload.source, 'route_catalog');
  assert.strictEqual(matrixFreshReplacementPayload.summaries.length, 50);
  assert(
    !matrixFreshReplacementRaw.includes(matrixReplacementFallbackRouteId),
    'Fresh route-catalog data must overwrite the obsolete persisted fallback payload.',
  );

  // D: a 503 with no same-query cache is provider unavailable, not blocked.
  const matrixUnavailableCriteria = { ...criteria, radiusMiles: 496, limit: 50 };
  const matrixUnavailableKey = createLiveTrailPackCatalogRefreshKey(matrixUnavailableCriteria);
  responses.push({ data: null, error: { message: '503 route catalog unavailable', status: 503 } });
  const matrixUnavailable = await refreshLiveTrailPackCatalog(matrixUnavailableCriteria);
  const matrixUnavailableSurface = buildProductionExploreSurface(
    matrixUnavailable,
    matrixUnavailableKey,
  );
  assert.strictEqual(matrixUnavailable.status, 'error');
  assert.strictEqual(matrixUnavailable.trailPacks.length, 0);
  assert.strictEqual(matrixUnavailable.asyncState.providerStatus, 'unavailable');
  assert.strictEqual(matrixUnavailableSurface.surface.kind, 'provider_unavailable');
  assert.strictEqual(matrixUnavailableSurface.surface.currentSuccessfulEvaluation, false);
  assert.strictEqual(matrixUnavailableSurface.surface.showBlockedNotice, false);

  const detailInvocations = invocations.filter((entry) => entry.name === 'route-catalog-detail');
  assert.strictEqual(detailInvocations[0].body.includeGeometry, true);
  assert(detailInvocations.every((entry) => entry.signal instanceof AbortSignal));
  assert(detailInvocations.every((entry) => Number.isFinite(entry.timeout)));
  const searchInvocations = invocations.filter((entry) => entry.name === 'route-catalog-search');
  assert(searchInvocations.every((entry) => entry.signal instanceof AbortSignal));
  assert(searchInvocations.every((entry) => Number.isFinite(entry.timeout)));
  const stagedSearchInvocation = searchInvocations.find(
    (entry) => entry.body.radiusMiles === 500 && entry.body.limit === 50,
  );
  const fullSearchInvocation = searchInvocations.find(
    (entry) => entry.body.radiusMiles === 500 && entry.body.limit === 500,
  );
  assert(stagedSearchInvocation);
  assert.strictEqual(stagedSearchInvocation.body.includePreviewGeometry, false);
  assert.strictEqual(stagedSearchInvocation.body.includeCoverageDiagnostics, false);
  assert.strictEqual(stagedSearchInvocation.body.page, 1);
  assert.strictEqual(stagedSearchInvocation.body.pageSize, 50);
  assert.strictEqual(stagedSearchInvocation.body.offset, 0);
  assert(fullSearchInvocation);
  assert.strictEqual(fullSearchInvocation.body.page, 1);
  assert.strictEqual(fullSearchInvocation.body.pageSize, 500);
  assert.strictEqual(fullSearchInvocation.body.offset, 0);

  console.log(JSON.stringify({
    metric: 'explore_route_surface_matrix',
    scenarios: {
      A: {
        normalized: matrixFresh.trailPacks.length,
        discoverable: matrixFreshSurface.inventory.totalDiscoverableCount,
        guidanceReady: matrixFreshSurface.inventory.totalReadyCount,
        visible: matrixFreshSurface.visibleCandidates.length,
        providerNotReady: matrixFreshSurface.providerNotReadyCount,
        state: matrixFreshSurface.surface.kind,
      },
      B: {
        normalized: matrixMixed.trailPacks.length,
        diagnostics: matrixMixed.guidanceDiagnosticRecords.length,
        visible: matrixMixedSurface.visibleCandidates.length,
        state: matrixMixedSurface.surface.kind,
      },
      C: {
        normalized: matrixBlocked.trailPacks.length,
        diagnostics: matrixBlocked.guidanceDiagnosticRecords.length,
        evaluated: matrixBlockedSurface.evaluatedCount,
        state: matrixBlockedSurface.surface.kind,
      },
      D: { visible: matrixUnavailableSurface.visibleCandidates.length, state: matrixUnavailableSurface.surface.kind },
      E: {
        visible: matrixPersistedBlockedSurface.visibleCandidates.length,
        state: matrixPersistedBlockedSurface.surface.kind,
        cacheHydrated: matrixPersistedBlockedEmissions.some(
          (emitted) => emitted.asyncState.source === 'cached',
        ),
        transientBlocked: false,
      },
      F: {
        visible: matrixStaleRevealableSurface.visibleCandidates.length,
        state: matrixStaleRevealableSurface.surface.kind,
        cacheHydrated: matrixStaleRevealableEmissions.some(
          (emitted) => emitted.asyncState.source === 'cached',
        ),
        transientBlocked: false,
      },
      G: {
        visible: matrixFreshReplacementSurface.visibleCandidates.length,
        state: matrixFreshReplacementSurface.surface.kind,
        persistedFallbackReplaced: !matrixFreshReplacementRaw.includes(
          matrixReplacementFallbackRouteId,
        ),
      },
      H: {
        discoverable: shortRouteAvailability.discoverability.eligible,
        tripBuilderEligible: shortRouteAvailability.tripBuilder.eligible,
        guidanceReady: shortRouteAvailability.guidance.eligible,
        reason: 'too_short',
      },
    },
  }));
  console.log(JSON.stringify({
    metric: 'explore_route_detail_provider_requests',
    rapidActions: 2,
    providerRequests: 1,
    warmCacheAdditionalRequests: 0,
  }));
  console.log('Explore live Trail Pack catalog refresh stability checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

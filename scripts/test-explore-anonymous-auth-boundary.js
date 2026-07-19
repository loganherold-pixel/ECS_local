/* global __dirname */
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
global.__DEV__ = false;

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
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

function headerValue(headers, name) {
  return new Headers(headers).get(name);
}

function isJwt(value) {
  return typeof value === 'string' && value.split('.').length === 3;
}

function bearerValue(value) {
  assert(
    typeof value === 'string' && value.startsWith('Bearer '),
    'The function request must carry an Authorization bearer category.',
  );
  return value.slice('Bearer '.length);
}

function syntheticJwt() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'none', typ: 'JWT' }),
    encode({ sub: 'synthetic-test-user', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
    'unsigned-test-signature',
  ].join('.');
}

function createCaptureFetch(captures) {
  return async (input, init = {}) => {
    captures.push({
      url: String(input),
      authorization: headerValue(init.headers, 'authorization'),
      apiKey: headerValue(init.headers, 'apikey'),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
    });
    return new Response(JSON.stringify({ records: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

async function exerciseSupabaseAccessBoundary(searchBody) {
  const projectUrl = 'https://anonymous-boundary-test.supabase.co';
  const publicProjectKey = `sb_publishable_${'x'.repeat(48)}`;
  const userAccessToken = syntheticJwt();
  const storageEvents = [];
  const storage = {
    getItem: async (key) => {
      storageEvents.push({ operation: 'get', key });
      return null;
    },
    setItem: async (key) => {
      storageEvents.push({ operation: 'set', key });
    },
    removeItem: async (key) => {
      storageEvents.push({ operation: 'remove', key });
    },
  };
  const captures = [];
  const publicClientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage,
    },
    global: { fetch: createCaptureFetch(captures) },
  };
  const signedOutClient = createClient(projectUrl, publicProjectKey, publicClientOptions);
  const initialSession = await signedOutClient.auth.getSession();
  assert.strictEqual(initialSession.data.session, null, 'The signed-out client must not synthesize a user session.');
  await signedOutClient.functions.invoke('route-catalog-search', { body: searchBody });

  const authenticatedClient = createClient(projectUrl, publicProjectKey, {
    accessToken: async () => userAccessToken,
    global: { fetch: createCaptureFetch(captures) },
  });
  await authenticatedClient.functions.invoke('route-catalog-search', { body: searchBody });

  const signedOutAgainClient = createClient(projectUrl, publicProjectKey, publicClientOptions);
  const finalSession = await signedOutAgainClient.auth.getSession();
  assert.strictEqual(finalSession.data.session, null, 'Signing out again must return to a no-session client identity.');
  await signedOutAgainClient.functions.invoke('route-catalog-search', { body: searchBody });

  assert.strictEqual(captures.length, 3);
  const [signedOutRequest, authenticatedRequest, signedOutAgainRequest] = captures;
  assert.deepStrictEqual(signedOutRequest.body, searchBody);
  assert.deepStrictEqual(authenticatedRequest.body, searchBody);
  assert.deepStrictEqual(signedOutAgainRequest.body, searchBody);
  assert(
    signedOutRequest.apiKey === publicProjectKey,
    'The public project key must remain in the apikey header.',
  );
  const firstPublicBearer = bearerValue(signedOutRequest.authorization);
  assert(firstPublicBearer === publicProjectKey);
  assert.strictEqual(isJwt(firstPublicBearer), false);
  assert(authenticatedRequest.apiKey === publicProjectKey);
  const authenticatedBearer = bearerValue(authenticatedRequest.authorization);
  assert(authenticatedBearer === userAccessToken);
  assert.strictEqual(isJwt(authenticatedBearer), true);
  assert(signedOutAgainRequest.apiKey === publicProjectKey);
  const finalPublicBearer = bearerValue(signedOutAgainRequest.authorization);
  assert(finalPublicBearer === publicProjectKey);
  assert.strictEqual(isJwt(finalPublicBearer), false);
  assert.strictEqual(
    storageEvents.some((event) => event.operation === 'set'),
    false,
    'A signed-out non-persistent client must not write an auth session to storage.',
  );
}

const providerResponses = [];
const providerInvocations = [];
const persistentCaches = new Map();
const mockSupabase = {
  functions: {
    async invoke(name, options) {
      providerInvocations.push({
        name,
        body: options?.body ?? null,
        signal: options?.signal ?? null,
      });
      const response = providerResponses.shift();
      if (!response) throw new Error(`Unexpected provider invocation: ${name}`);
      return response;
    },
  },
  from(table) {
    assert.strictEqual(table, 'trail_packs');
    const query = {
      select() { return query; },
      eq() { return query; },
      neq() { return query; },
      order() { return query; },
      limit() { return query; },
      abortSignal() { return query; },
      then(resolve, reject) {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return query;
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
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
    parent?.filename.includes(`${path.sep}lib${path.sep}explore${path.sep}`)
  ) {
    return {
      createPersistedKeyValueCache(fileKey) {
        if (!persistentCaches.has(fileKey)) {
          const values = new Map();
          persistentCaches.set(fileKey, {
            values,
            get: (key) => values.get(key) ?? null,
            set: (key, value) => values.set(key, value),
            delete: (key) => values.delete(key),
            clear: () => values.clear(),
            flush: async () => {},
            waitForHydration: async () => {},
            isHydrated: () => true,
          });
        }
        return persistentCaches.get(fileKey);
      },
    };
  }
  return originalLoad.apply(this, [request, parent, isMain]);
};

const {
  buildRouteCatalogSearchBody,
  createLiveTrailPackCatalogRefreshKey,
  liveTrailPackCatalogStore,
  mergeLiveTrailPackCatalogPageSnapshots,
  refreshLiveTrailPackCatalog,
  routeCatalogSummaryCacheKeys,
  scopeLiveTrailPackCatalogSnapshotToAccessContext,
  transitionLiveTrailPackCatalogAccessContext,
} = require(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'));
const {
  EXPLORE_ANONYMOUS_ACCESS_PARTITION,
  createExploreAccessContextPartition,
} = require(path.join(root, 'lib', 'auth', 'exploreAccessContextPartition.ts'));
const {
  buildExploreGuidanceReadyInventory,
  classifyExploreRouteAvailability,
  deriveExploreRouteSurfaceState,
} = require(path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'));
const {
  isPublicSuggestedTrailheadTrailPack,
  trailPackToExpeditionOpportunity,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));
const {
  resolveExploreTripBuilderRouteDetail,
} = require(path.join(root, 'lib', 'explore', 'exploreTripBuilderRouteDetail.ts'));

const ANONYMOUS_SEARCH_CRITERIA = Object.freeze({
  latitude: 0,
  longitude: 0,
  radiusMiles: 500,
  locationSource: 'repository_approved_test_area',
  vehicleClass: 'full_size_4x4',
  page: 1,
  pageSize: 51,
  accessContextPartition: EXPLORE_ANONYMOUS_ACCESS_PARTITION,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

function publicShortRouteRecord() {
  const now = new Date().toISOString();
  return {
    id: 'anonymous-public-short-route',
    public_id: 'anonymous-public-short-route',
    name: 'Anonymous Public Short Route',
    description: 'Synthetic public summary used only by the anonymous boundary regression.',
    route_type: 'point_to_point',
    center_latitude: 0,
    center_longitude: 0,
    route_geometry_mode: 'omitted',
    geometry_quality: 'good',
    distance_miles: 2,
    estimated_duration_minutes: 45,
    difficulty: 'easy',
    vehicle_fit: ['full_size_4x4'],
    official_access_coverage_pct: 100,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    verification_status: 'verified',
    review_status: 'approved',
    recommendation_status: 'recommended',
    source_records: [{
      provider_id: 'synthetic-official-source',
      label: 'Synthetic official source',
      source_type: 'official',
      authority: 'official',
      last_verified_at: now,
    }],
    tags: ['anonymous-regression'],
    created_at: now,
    updated_at: now,
  };
}

function successfulSearchResponse(recordOrRecords, pagination = {}) {
  const records = Array.isArray(recordOrRecords) ? recordOrRecords : [recordOrRecords];
  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 50;
  const totalMatchedCount = pagination.totalMatchedCount ?? records.length;
  const hasMore = pagination.hasMore ?? false;
  return {
    data: {
      records,
      diagnosticRecords: [],
      coverageState: {
        state: 'ready',
        title: 'Verified routes available',
        message: 'Synthetic source-backed public route matches the test criteria.',
      },
      meta: {
        paginationContractVersion: 'route_catalog_ranked_page_v1',
        nearbyRouteRpcUsed: true,
        nearbyRouteRpc: 'route_catalog_nearby_public_route_cursor_page',
        fallbackQueryUsed: false,
        candidateCount: records.length,
        radiusMatchedCount: records.length,
        geometryMatchedCount: 0,
        trailheadMatchedCount: 0,
        centerMatchedCount: records.length,
        curationCandidateCount: 0,
        anySourceBackedCandidateCount: records.length,
        radiusFilterApplied: true,
        page,
        pageSize,
        offset: (page - 1) * pageSize,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
        nextCursor: null,
        totalMatchedCount,
        totalMatchedCountBounded: false,
      },
    },
    error: null,
  };
}

function buildProductionSurface(snapshot, currentRefreshKey) {
  const trailPackRoutes = snapshot.trailPacks
    .filter(isPublicSuggestedTrailheadTrailPack)
    .map(trailPackToExpeditionOpportunity)
    .map((route) => ({
      ...route,
      routeMetadata: {
        ...(route.routeMetadata ?? {}),
        withinRadius: true,
        exploreGuidanceReadyEnabled: true,
      },
    }));
  const inventory = buildExploreGuidanceReadyInventory({
    trailPacks: trailPackRoutes,
    hiddenGemRoutes: [],
    ecsRouteIdeas: [],
    favoriteRoutes: [],
    savedRouteAssets: [],
    selectedRefinement: null,
  });
  const visibleCandidates = inventory.discoverableCandidateSet.candidates;
  const providerNotReadyCount =
    snapshot.guidanceDiagnosticTrailPacks.length + snapshot.guidanceDiagnosticRecords.length;
  const evaluatedCount = inventory.totalReadyCount + inventory.rangeExclusionTotal + providerNotReadyCount;
  const surface = deriveExploreRouteSurfaceState({
    status: snapshot.status,
    providerStatus: snapshot.asyncState.providerStatus,
    catalogSource: snapshot.source,
    sourceTruth: snapshot.asyncState.source,
    freshness: snapshot.asyncState.freshness,
    snapshotRefreshKey: snapshot.refreshKey,
    currentRefreshKey,
    visibleCandidateCount: visibleCandidates.length,
    candidateCount: inventory.discoverableCandidateSet.candidates.length,
    discoverableCount: inventory.totalDiscoverableCount,
    readyCount: inventory.totalReadyCount,
    evaluatedCount,
    hasRangeData:
      snapshot.trailPacks.length > 0 ||
      snapshot.routeCatalogSummaries.length > 0 ||
      providerNotReadyCount > 0,
    isSourceFilterAll: true,
    isLoading: snapshot.status === 'idle' || snapshot.status === 'loading',
    validEmpty:
      snapshot.status === 'empty' &&
      snapshot.refreshKey === currentRefreshKey &&
      snapshot.trailPacks.length === 0 &&
      snapshot.routeCatalogSummaries.length === 0 &&
      providerNotReadyCount === 0 &&
      evaluatedCount === 0,
  });
  return { inventory, visibleCandidates, surface };
}

function fullGeometryShortTrailPack(summaryPack) {
  return {
    ...summaryPack,
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0.01, 0.01],
      ],
    },
    routeGeometryMode: 'full',
    distanceMiles: 2,
    catalogVerification: {
      ...summaryPack.catalogVerification,
      publicRecommendation: true,
      blockers: [],
      activeGuidance: {
        status: 'ready',
        topologyResolved: true,
        sourceSegmentCount: 1,
        componentCount: 1,
        branchDetected: false,
        joinedSegmentGapCount: 0,
        disjointSegmentGapCount: 0,
        maxJoinGapMeters: 0,
        maxSegmentGapMeters: 0,
        unavailableReason: null,
      },
    },
  };
}

function accessContextTestUser(subject, appMetadata = {}, extra = {}) {
  return {
    id: subject,
    role: 'authenticated',
    app_metadata: appMetadata,
    ...extra,
  };
}

function routeRecordForAccessContext(id) {
  return {
    ...publicShortRouteRecord(),
    id,
    public_id: id,
    name: `Synthetic route ${id}`,
  };
}

async function exerciseApplicationAccessContextPartitioning() {
  const rawPrincipalA = 'private-principal-a';
  const rawPrincipalB = 'private-principal-b';
  const privateEmail = 'principal-a@example.invalid';
  const privateToken = 'header.payload.signature';
  const userA = accessContextTestUser(rawPrincipalA, {
    organization_id: 'private-organization-a',
    tier: 'standard',
  }, {
    email: privateEmail,
    access_token: privateToken,
    expires_at: 123456789,
    user_metadata: { display_name: 'Private Operator A' },
  });
  const userARefreshed = accessContextTestUser(rawPrincipalA, {
    tier: 'standard',
    organization_id: 'private-organization-a',
  }, {
    email: 'updated-principal-a@example.invalid',
    access_token: 'rotated.header.signature',
    expires_at: 987654321,
    user_metadata: { display_name: 'Renamed Operator A' },
  });
  const userB = accessContextTestUser(rawPrincipalB, {
    organization_id: 'private-organization-b',
    tier: 'standard',
  });
  const userAWithChangedClaims = accessContextTestUser(rawPrincipalA, {
    organization_id: 'private-organization-a',
    tier: 'restricted',
  });

  const partitionA = createExploreAccessContextPartition(userA);
  const refreshedPartitionA = createExploreAccessContextPartition(userARefreshed);
  const partitionB = createExploreAccessContextPartition(userB);
  const changedClaimsPartitionA = createExploreAccessContextPartition(userAWithChangedClaims);
  assert.match(partitionA, /^authenticated:[0-9a-f]{32}$/);
  assert.strictEqual(refreshedPartitionA, partitionA, 'Token rotation and profile-only changes must retain the partition.');
  assert.notStrictEqual(partitionB, partitionA, 'Different principals must use different partitions.');
  assert.notStrictEqual(
    changedClaimsPartitionA,
    partitionA,
    'Material authorization-claim changes must create a new access partition.',
  );
  assert(!partitionA.includes(rawPrincipalA));
  assert(!partitionB.includes(rawPrincipalB));

  const baseCriteria = { ...ANONYMOUS_SEARCH_CRITERIA, radiusMiles: 481 };
  const anonymousCriteria = {
    ...baseCriteria,
    accessContextPartition: EXPLORE_ANONYMOUS_ACCESS_PARTITION,
  };
  const userACriteria = { ...baseCriteria, accessContextPartition: partitionA };
  const userBCriteria = { ...baseCriteria, accessContextPartition: partitionB };
  assert.deepStrictEqual(buildRouteCatalogSearchBody(anonymousCriteria), buildRouteCatalogSearchBody(userACriteria));
  assert.deepStrictEqual(buildRouteCatalogSearchBody(userACriteria), buildRouteCatalogSearchBody(userBCriteria));
  assert.notStrictEqual(
    createLiveTrailPackCatalogRefreshKey(anonymousCriteria),
    createLiveTrailPackCatalogRefreshKey(userACriteria),
  );
  assert.notStrictEqual(
    createLiveTrailPackCatalogRefreshKey(userACriteria),
    createLiveTrailPackCatalogRefreshKey(userBCriteria),
  );
  assert.notDeepStrictEqual(routeCatalogSummaryCacheKeys(anonymousCriteria), routeCatalogSummaryCacheKeys(userACriteria));
  assert.notDeepStrictEqual(routeCatalogSummaryCacheKeys(userACriteria), routeCatalogSummaryCacheKeys(userBCriteria));
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(buildRouteCatalogSearchBody(userACriteria), 'accessContextPartition'),
    false,
    'The local access partition must never be sent to the backend.',
  );

  // A/H: identical anonymous and authenticated search criteria use the same
  // backend contract but cannot share request, in-memory, or persisted identity.
  transitionLiveTrailPackCatalogAccessContext(EXPLORE_ANONYMOUS_ACCESS_PARTITION);
  providerResponses.push(successfulSearchResponse(routeRecordForAccessContext('anonymous-route')));
  const anonymousSnapshot = await refreshLiveTrailPackCatalog(anonymousCriteria);
  assert.deepStrictEqual(anonymousSnapshot.trailPacks.map((route) => route.id), ['anonymous-route']);
  const afterAnonymousSignIn = transitionLiveTrailPackCatalogAccessContext(partitionA);
  assert.strictEqual(afterAnonymousSignIn.trailPacks.length, 0);
  assert.strictEqual(afterAnonymousSignIn.routeCatalogSummaries.length, 0);
  providerResponses.push(successfulSearchResponse(routeRecordForAccessContext('account-a-route')));
  const accountASnapshot = await refreshLiveTrailPackCatalog(userACriteria);
  assert.strictEqual(accountASnapshot.accessContextPartition, partitionA);
  assert.deepStrictEqual(accountASnapshot.trailPacks.map((route) => route.id), ['account-a-route']);
  assert.strictEqual(
    transitionLiveTrailPackCatalogAccessContext(refreshedPartitionA).trailPacks.length,
    1,
    'A same-principal token refresh must not clear the current inventory.',
  );

  const scopedForB = scopeLiveTrailPackCatalogSnapshotToAccessContext(accountASnapshot, partitionB);
  assert.strictEqual(scopedForB.status, 'idle');
  assert.strictEqual(scopedForB.trailPacks.length, 0);
  assert.strictEqual(scopedForB.routeCatalogSummaries.length, 0);
  const afterAccountSwitch = transitionLiveTrailPackCatalogAccessContext(partitionB);
  assert.strictEqual(afterAccountSwitch.accessContextPartition, partitionB);
  assert.strictEqual(afterAccountSwitch.trailPacks.length, 0);
  providerResponses.push(successfulSearchResponse(routeRecordForAccessContext('account-b-route')));
  const accountBSnapshot = await refreshLiveTrailPackCatalog(userBCriteria);
  assert.deepStrictEqual(accountBSnapshot.trailPacks.map((route) => route.id), ['account-b-route']);
  assert(!accountBSnapshot.trailPacks.some((route) => route.id === 'account-a-route'));

  // F/G: a signed-out restart/revalidation may not select the authenticated
  // partition's persisted or last-good inventory.
  const accountALastGoodCriteria = {
    ...userACriteria,
    radiusMiles: 485,
  };
  const signedOutFailureCriteria = {
    ...anonymousCriteria,
    radiusMiles: 485,
  };
  transitionLiveTrailPackCatalogAccessContext(partitionA);
  providerResponses.push(successfulSearchResponse(routeRecordForAccessContext('account-a-last-good')));
  const accountALastGood = await refreshLiveTrailPackCatalog(accountALastGoodCriteria);
  assert.strictEqual(accountALastGood.trailPacks.length, 1);
  transitionLiveTrailPackCatalogAccessContext(EXPLORE_ANONYMOUS_ACCESS_PARTITION);
  providerResponses.push({ data: null, error: { message: 'Synthetic anonymous provider unavailable.' } });
  const signedOutFailure = await refreshLiveTrailPackCatalog(signedOutFailureCriteria);
  assert.strictEqual(signedOutFailure.status, 'error');
  assert.strictEqual(signedOutFailure.accessContextPartition, EXPLORE_ANONYMOUS_ACCESS_PARTITION);
  assert.strictEqual(signedOutFailure.trailPacks.length, 0);
  assert.strictEqual(signedOutFailure.routeCatalogSummaries.length, 0);
  assert.strictEqual(signedOutFailure.asyncState.lastGoodData, null);

  const cacheAdapter = persistentCaches.get('explore.catalog.summary.v5');
  assert(cacheAdapter, 'The access-partitioned v5 summary cache must be initialized.');
  assert.strictEqual(persistentCaches.has('explore.catalog.summary.v4'), false);
  const accountAKey = routeCatalogSummaryCacheKeys(userACriteria)[0];
  const accountARaw = cacheAdapter.get(accountAKey);
  assert(accountARaw, 'Account A should have a separately keyed persisted summary snapshot.');
  const accountAPayload = JSON.parse(accountARaw);
  assert.strictEqual(accountAPayload.accessContextPartition, partitionA);
  const accountBRaw = cacheAdapter.get(routeCatalogSummaryCacheKeys(userBCriteria)[0]);
  assert(accountBRaw, 'Account B should have a separately keyed persisted summary snapshot.');
  assert.strictEqual(JSON.parse(accountBRaw).accessContextPartition, partitionB);
  const anonymousRaw = cacheAdapter.get(routeCatalogSummaryCacheKeys(anonymousCriteria)[0]);
  assert(anonymousRaw, 'The separate public anonymous cache may remain reusable.');
  assert.strictEqual(
    JSON.parse(anonymousRaw).accessContextPartition,
    EXPLORE_ANONYMOUS_ACCESS_PARTITION,
  );
  cacheAdapter.set('unrelated.keep', 'untouched');
  const legacyAnonymousCriteria = {
    ...anonymousCriteria,
    radiusMiles: 482,
  };
  const legacyAnonymousKey = routeCatalogSummaryCacheKeys(legacyAnonymousCriteria)[0];
  cacheAdapter.set(legacyAnonymousKey, JSON.stringify({
    ...accountAPayload,
    accessContextPartition: undefined,
    refreshKey: createLiveTrailPackCatalogRefreshKey(legacyAnonymousCriteria),
  }));
  providerResponses.push({ data: null, error: { message: 'Synthetic legacy-cache revalidation unavailable.' } });
  const legacyCacheResult = await refreshLiveTrailPackCatalog(legacyAnonymousCriteria);
  assert.strictEqual(legacyCacheResult.status, 'error');
  assert.strictEqual(legacyCacheResult.routeCatalogSummaries.length, 0);
  assert.strictEqual(cacheAdapter.get('unrelated.keep'), 'untouched');

  const pageOneCriteria = {
    ...userACriteria,
    radiusMiles: 483,
    page: 1,
    pageSize: 50,
    limit: 50,
  };
  transitionLiveTrailPackCatalogAccessContext(partitionA);
  providerResponses.push(successfulSearchResponse(routeRecordForAccessContext('account-a-page-one'), {
    page: 1,
    pageSize: 50,
    totalMatchedCount: 2,
    hasMore: true,
  }));
  await refreshLiveTrailPackCatalog(pageOneCriteria);
  const pageTwoDeferred = deferred();
  const pageTwoCriteria = { ...pageOneCriteria, page: 2 };
  const invocationCountBeforePageTwo = providerInvocations.length;
  providerResponses.push(pageTwoDeferred.promise);
  const pageTwoRequest = refreshLiveTrailPackCatalog(pageTwoCriteria);
  await waitFor(
    () => providerInvocations.length > invocationCountBeforePageTwo,
    'The authenticated continuation request should reach the provider.',
  );
  const pageTwoInvocation = providerInvocations.at(-1);
  transitionLiveTrailPackCatalogAccessContext(EXPLORE_ANONYMOUS_ACCESS_PARTITION);
  assert.strictEqual(pageTwoInvocation.signal.aborted, true, 'Sign-out must abort an authenticated continuation.');
  pageTwoDeferred.resolve(successfulSearchResponse(routeRecordForAccessContext('account-a-page-two'), {
    page: 2,
    pageSize: 50,
    totalMatchedCount: 2,
    hasMore: false,
  }));
  await pageTwoRequest.catch(() => liveTrailPackCatalogStore.getSnapshot());
  const afterSignedOutContinuation = liveTrailPackCatalogStore.getSnapshot();
  assert.strictEqual(afterSignedOutContinuation.accessContextPartition, EXPLORE_ANONYMOUS_ACCESS_PARTITION);
  assert.strictEqual(afterSignedOutContinuation.trailPacks.length, 0);

  const anonymousDeferred = deferred();
  const anonymousInFlightCriteria = { ...anonymousCriteria, radiusMiles: 484 };
  const invocationCountBeforeAnonymous = providerInvocations.length;
  providerResponses.push(anonymousDeferred.promise);
  const anonymousRequest = refreshLiveTrailPackCatalog(anonymousInFlightCriteria);
  await waitFor(
    () => providerInvocations.length > invocationCountBeforeAnonymous,
    'The anonymous request should reach the provider before sign-in.',
  );
  const anonymousInvocation = providerInvocations.at(-1);
  transitionLiveTrailPackCatalogAccessContext(partitionB);
  assert.strictEqual(anonymousInvocation.signal.aborted, true, 'Sign-in must abort the old anonymous request.');
  anonymousDeferred.resolve(successfulSearchResponse(routeRecordForAccessContext('late-anonymous-route')));
  await anonymousRequest.catch(() => liveTrailPackCatalogStore.getSnapshot());
  const afterAnonymousCompletion = liveTrailPackCatalogStore.getSnapshot();
  assert.strictEqual(afterAnonymousCompletion.accessContextPartition, partitionB);
  assert.strictEqual(afterAnonymousCompletion.trailPacks.length, 0);

  transitionLiveTrailPackCatalogAccessContext(changedClaimsPartitionA);
  assert.strictEqual(liveTrailPackCatalogStore.getSnapshot().trailPacks.length, 0);

  const persistedDump = JSON.stringify(
    [...cacheAdapter.values.entries()].filter(([key]) => key !== 'unrelated.keep'),
  );
  const requestDump = JSON.stringify(providerInvocations.map(({ name, body }) => ({ name, body })));
  [rawPrincipalA, rawPrincipalB, privateEmail, privateToken, 'private-organization-a'].forEach((secret) => {
    assert(!persistedDump.includes(secret), `Persisted Explorer cache must not contain ${secret}.`);
    assert(!requestDump.includes(secret), `Route-catalog request bodies must not contain ${secret}.`);
  });
}

async function exerciseProductionAnonymousExplorePath() {
  transitionLiveTrailPackCatalogAccessContext(EXPLORE_ANONYMOUS_ACCESS_PARTITION);
  const criteria = { ...ANONYMOUS_SEARCH_CRITERIA };
  const expectedBody = buildRouteCatalogSearchBody(criteria);
  assert.strictEqual(expectedBody.radiusMiles, 500);
  assert.strictEqual(expectedBody.limit, 50);
  assert.strictEqual(expectedBody.pageSize, 50);
  assert.strictEqual(expectedBody.page, 1);
  assert.strictEqual(expectedBody.offset, 0);
  assert.strictEqual(expectedBody.vehicleClass, 'full_size_4x4');
  assert.strictEqual(expectedBody.recommendationOnly, true);
  assert.strictEqual(expectedBody.includeGeometry, false);
  assert.strictEqual(expectedBody.includeAssessment, true);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(expectedBody, 'source'),
    false,
    'The source=all client contract is represented by omitting a restrictive source filter.',
  );

  const failureCriteria = { ...criteria, radiusMiles: 499 };
  providerResponses.push({ data: null, error: { message: 'Synthetic provider unavailable.' } });
  const failedSnapshot = await refreshLiveTrailPackCatalog(failureCriteria);
  const failedSurface = buildProductionSurface(
    failedSnapshot,
    createLiveTrailPackCatalogRefreshKey(failureCriteria),
  );
  assert.strictEqual(failedSnapshot.status, 'error');
  assert.strictEqual(failedSnapshot.asyncState.providerStatus, 'unavailable');
  assert.strictEqual(failedSurface.surface.kind, 'provider_unavailable');
  assert.strictEqual(failedSurface.surface.showBlockedNotice, false);

  const anonymousOversizedRecords = Array.from({ length: 51 }, (_, index) => ({
    ...publicShortRouteRecord(),
    id: `anonymous-public-short-route-${String(index).padStart(2, '0')}`,
    public_id: `anonymous-public-short-route-${String(index).padStart(2, '0')}`,
    name: `Anonymous Public Short Route ${index}`,
    featured_route_score: index === 50 ? 100 : 0,
  }));
  providerResponses.push(successfulSearchResponse(anonymousOversizedRecords.slice(0, 50), {
    page: 1,
    pageSize: 50,
    totalMatchedCount: 51,
    hasMore: true,
  }));
  const firstPageSnapshot = await refreshLiveTrailPackCatalog(criteria);
  assert.strictEqual(firstPageSnapshot.trailPacks.length, 50);
  assert.strictEqual(firstPageSnapshot.searchMeta.hasMore, true);
  assert.strictEqual(firstPageSnapshot.searchMeta.nextPage, 2);

  const pageTwoCriteria = { ...criteria, page: 2, pageSize: 50, limit: 50 };
  providerResponses.push(successfulSearchResponse(anonymousOversizedRecords.slice(50), {
    page: 2,
    pageSize: 50,
    totalMatchedCount: 51,
    hasMore: false,
  }));
  const pageTwoSnapshot = await refreshLiveTrailPackCatalog(pageTwoCriteria);
  const snapshot = mergeLiveTrailPackCatalogPageSnapshots(
    firstPageSnapshot,
    pageTwoSnapshot,
    createLiveTrailPackCatalogRefreshKey(criteria),
  );
  assert.strictEqual(snapshot.status, 'ready');
  assert.strictEqual(snapshot.source, 'route_catalog');
  assert.strictEqual(snapshot.trailPacks.length, 51);
  assert.strictEqual(new Set(snapshot.trailPacks.map((pack) => pack.id)).size, 51);
  assert(
    snapshot.trailPacks.some((pack) => pack.id === 'anonymous-public-short-route-50'),
    'The final route from the continuation page must remain reachable in the signed-out result set.',
  );
  assert.strictEqual(snapshot.searchMeta.hasMore, false);
  assert.strictEqual(snapshot.searchMeta.nextPage, null);
  assert.strictEqual(snapshot.guidanceDiagnosticRecords.length, 0);
  const [pageOneInvocation, pageTwoInvocation] = providerInvocations.slice(-2);
  assert.strictEqual(pageOneInvocation.name, 'route-catalog-search');
  assert.deepStrictEqual(pageOneInvocation.body, expectedBody);
  assert.strictEqual(pageTwoInvocation.name, 'route-catalog-search');
  assert.deepStrictEqual(pageTwoInvocation.body, buildRouteCatalogSearchBody(pageTwoCriteria));

  const rendered = buildProductionSurface(snapshot, createLiveTrailPackCatalogRefreshKey(criteria));
  assert.strictEqual(rendered.inventory.totalDiscoverableCount, 51);
  assert.strictEqual(rendered.inventory.totalReadyCount, 0);
  assert.strictEqual(rendered.visibleCandidates.length, 51);
  assert.strictEqual(rendered.surface.kind, 'cards');
  assert.strictEqual(rendered.surface.showBlockedNotice, false);

  const candidate = rendered.visibleCandidates[0];
  assert.strictEqual(candidate.discoverable, true);
  assert.strictEqual(candidate.tripBuilderEligible, true);
  assert.strictEqual(candidate.guidanceReady, false);
  const summaryAvailability = classifyExploreRouteAvailability(candidate.route);
  assert.strictEqual(summaryAvailability.discoverability.eligible, true);
  assert.strictEqual(summaryAvailability.tripBuilder.eligible, true);
  assert.strictEqual(summaryAvailability.guidance.eligible, false);
  assert(summaryAvailability.guidance.exclusionCodes.includes('too_short'));

  const selectedTrailPack = snapshot.trailPacks.find(
    (pack) => pack.id === candidate.route.routeMetadata?.trailPackId,
  );
  assert(selectedTrailPack, 'The selected summary card must retain its stable Trail Pack identity.');
  const hydrated = await resolveExploreTripBuilderRouteDetail(candidate.route, {
    fetchDetail: async () => fullGeometryShortTrailPack(selectedTrailPack),
  });
  assert.strictEqual(hydrated.status, 'ready');
  assert.strictEqual(hydrated.route.id, candidate.route.id);
  const hydratedAvailability = classifyExploreRouteAvailability(hydrated.route);
  assert.strictEqual(
    hydratedAvailability.discoverability.eligible,
    true,
    JSON.stringify(hydratedAvailability),
  );
  assert.strictEqual(hydratedAvailability.tripBuilder.eligible, true);
  assert.strictEqual(hydratedAvailability.guidance.eligible, false);
  assert(hydratedAvailability.guidance.exclusionCodes.includes('too_short'));
}

(async () => {
  await exerciseSupabaseAccessBoundary(buildRouteCatalogSearchBody(ANONYMOUS_SEARCH_CRITERIA));
  await exerciseApplicationAccessContextPartitioning();
  await exerciseProductionAnonymousExplorePath();
  assert.strictEqual(providerResponses.length, 0, 'All deterministic provider fixtures must be consumed.');
  console.log('PASS: Explorer auth-aware request/cache partitioning, anonymous rendering, provider failure, and short-route handoff');
})().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});

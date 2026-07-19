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
      providerInvocations.push({ name, body: options?.body ?? null });
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
  refreshLiveTrailPackCatalog,
} = require(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'));
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
});

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

function successfulSearchResponse(recordOrRecords) {
  const records = Array.isArray(recordOrRecords) ? recordOrRecords : [recordOrRecords];
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
        paginationContractVersion: 'route_catalog_public_cursor_page_v2',
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
        page: 1,
        pageSize: records.length,
        offset: 0,
        hasMore: false,
        nextPage: null,
        nextCursor: null,
        totalMatchedCount: records.length,
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

async function exerciseProductionAnonymousExplorePath() {
  const criteria = { ...ANONYMOUS_SEARCH_CRITERIA };
  const expectedBody = buildRouteCatalogSearchBody(criteria);
  assert.strictEqual(expectedBody.radiusMiles, 500);
  assert.strictEqual(expectedBody.limit, 20);
  assert.strictEqual(expectedBody.pageSize, 20);
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
  providerResponses.push(successfulSearchResponse(anonymousOversizedRecords));
  const snapshot = await refreshLiveTrailPackCatalog(criteria);
  assert.strictEqual(snapshot.status, 'ready');
  assert.strictEqual(snapshot.source, 'route_catalog');
  assert.strictEqual(snapshot.trailPacks.length, 20);
  assert.strictEqual(new Set(snapshot.trailPacks.map((pack) => pack.id)).size, 20);
  assert.strictEqual(snapshot.trailPacks[0].id, 'anonymous-public-short-route-50');
  assert.strictEqual(snapshot.guidanceDiagnosticRecords.length, 0);
  const successInvocation = providerInvocations.at(-1);
  assert.strictEqual(successInvocation.name, 'route-catalog-search');
  assert.deepStrictEqual(successInvocation.body, expectedBody);

  const rendered = buildProductionSurface(snapshot, createLiveTrailPackCatalogRefreshKey(criteria));
  assert.strictEqual(rendered.inventory.totalDiscoverableCount, 20);
  assert.strictEqual(rendered.inventory.totalReadyCount, 0);
  assert.strictEqual(rendered.visibleCandidates.length, 20);
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

  const hydrated = await resolveExploreTripBuilderRouteDetail(candidate.route, {
    fetchDetail: async () => fullGeometryShortTrailPack(snapshot.trailPacks[0]),
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
  await exerciseProductionAnonymousExplorePath();
  assert.strictEqual(providerResponses.length, 0, 'All deterministic provider fixtures must be consumed.');
  console.log('PASS: anonymous Explorer auth boundary, public rendering, provider failure, and short-route handoff');
})().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});

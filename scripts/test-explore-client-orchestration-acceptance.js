const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

process.env.NODE_ENV = 'test';
const root = path.join(__dirname, '..');
require.extensions['.ts'] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../supabase' && parent?.filename.endsWith(`${path.sep}liveTrailPackCatalog.ts`)) {
    return { supabase: { functions: { invoke: async () => { throw new Error('Unexpected live transport'); } }, from: () => ({}) } };
  }
  return originalLoad(request, parent, isMain);
};

const live = require(path.join(root, 'lib', 'explore', 'liveTrailPackCatalog.ts'));
const performance = require(path.join(root, 'lib', 'explore', 'explorePerformance.ts'));
const navigation = require(path.join(root, 'lib', 'explore', 'routeSummaryNavigation.ts'));

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function route(index, overrides = {}) {
  const id = `acceptance-${String(index).padStart(3, '0')}`;
  const latitude = index * 0.001;
  const longitude = -140 + index * 0.001;
  return {
    id,
    public_id: id,
    name: `ECS ACCEPTANCE ${index}`,
    route_type: 'loop',
    center_latitude: latitude,
    center_longitude: longitude,
    route_geometry: { type: 'LineString', coordinates: [[longitude, latitude], [longitude + 0.0001, latitude + 0.0001]] },
    route_geometry_mode: 'preview_simplified',
    difficulty: 'easy',
    official_access_coverage_pct: 100,
    unknown_access_coverage_pct: 0,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    geometry_quality: 'good',
    verification_status: 'official_verified',
    recommendation_status: 'recommendable',
    review_status: 'approved',
    confidence_score: 100 - index,
    source_records: [{ provider_id: 'acceptance', source_type: 'official', label: 'Acceptance', authority: 'acceptance', last_verified_at: '2099-01-01T00:00:00.000Z' }],
    created_at: '2099-01-01T00:00:00.000Z',
    updated_at: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function response(records, overrides = {}) {
  return {
    data: {
      ok: true,
      records,
      meta: {
        candidateCount: records.length,
        radiusMatchedCount: records.length,
        curationCandidateCount: 0,
        anySourceBackedCandidateCount: records.length,
        radiusFilterApplied: true,
        additionalMatchesExist: records.length > 20,
        nextPage: null,
        nextCursor: null,
        ...overrides,
      },
    },
    error: null,
  };
}

function criteria(overrides = {}) {
  return { latitude: 0, longitude: -140, radiusMiles: 50, accessPartition: 'anonymous', ...overrides };
}

function reset(search) {
  live.resetRouteDiscoveryAcceptanceState();
  performance.resetExplorePerformanceRecords();
  live.configureRouteDiscoveryAcceptanceTransport({
    search,
    legacy: async () => { throw new Error('legacy unavailable'); },
  });
}

async function sharingAndNormalization() {
  const pending = deferred();
  let calls = 0;
  reset(() => { calls += 1; return pending.promise; });
  let normalizedPublications = 0;
  const unsubscribe = live.liveTrailPackCatalogStore.subscribe(() => {
    if (live.liveTrailPackCatalogStore.getSnapshot().cacheRevision > 0) normalizedPublications += 1;
  });
  const first = live.refreshLiveTrailPackCatalog(criteria());
  const duplicate = live.refreshLiveTrailPackCatalog(criteria());
  assert.strictEqual(calls, 1);
  pending.resolve(response([...Array.from({ length: 25 }, (_, index) => route(index + 1)), route(1)]));
  const [left, right] = await Promise.all([first, duplicate]);
  unsubscribe();
  assert.strictEqual(left.requestId, right.requestId);
  assert.strictEqual(left.cacheRevision, 1);
  assert.strictEqual(normalizedPublications, 1);
  assert.strictEqual(left.trailPacks.length, 20);
  assert.strictEqual(new Set(left.trailPacks.map((item) => item.id)).size, 20);
  assert.strictEqual(left.searchMeta.additionalMatchesExist, true);
}

async function fingerprintSeparation() {
  let calls = 0;
  reset(async () => { calls += 1; return response([route(calls)]); });
  const dimensions = [
    criteria(),
    criteria({ latitude: 0.1 }),
    criteria({ radiusMiles: 60 }),
    criteria({ vehicleClass: 'utv' }),
    criteria({ sourceAdapter: 'acceptance' }),
    criteria({ recommendationMode: 'needs_review' }),
    criteria({ accessPartition: 'authenticated' }),
    criteria({ contractVersion: 'strict-top-20-v2' }),
  ];
  for (const value of dimensions) await live.refreshLiveTrailPackCatalog(value);
  assert.strictEqual(calls, dimensions.length);
  assert.strictEqual(new Set(dimensions.map((value) => performance.createPrivacySafeSearchFingerprint(live.buildRouteCatalogSearchFingerprintInput(value)))).size, dimensions.length);
}

async function staleMatrix(aResult, bResult, expected) {
  const pending = [];
  reset(() => { const next = deferred(); pending.push(next); return next.promise; });
  const a = live.refreshLiveTrailPackCatalog(criteria({ radiusMiles: 60 }));
  const b = live.refreshLiveTrailPackCatalog(criteria({ radiusMiles: 70, accessPartition: expected.partition }));
  pending[1].resolve(bResult);
  await b;
  const authoritative = live.liveTrailPackCatalogStore.getSnapshot();
  pending[0].resolve(aResult);
  await a;
  const final = live.liveTrailPackCatalogStore.getSnapshot();
  assert.deepStrictEqual(final, authoritative);
  assert.strictEqual(final.status, expected.status);
  assert.strictEqual(final.accessPartition, expected.partition);
  assert.strictEqual(final.searchMeta?.additionalMatchesExist ?? false, expected.additionalMatchesExist);
}

async function staleResponseCases() {
  await staleMatrix(response([route(1)]), response([route(2)], { additionalMatchesExist: true }), { status: 'ready', partition: 'anonymous', additionalMatchesExist: true });
  await staleMatrix(response([route(1)]), { data: null, error: { message: 'B failed' } }, { status: 'error', partition: 'anonymous', additionalMatchesExist: false });
  await staleMatrix({ data: null, error: { message: 'A failed' } }, response([route(2)]), { status: 'ready', partition: 'authenticated', additionalMatchesExist: false });
}

async function lastGoodAndMalformedContracts() {
  let fail = false;
  reset(async () => fail ? { data: null, error: { message: 'provider failed' } } : response([route(1), route(2)], { additionalMatchesExist: true }));
  const good = await live.refreshLiveTrailPackCatalog(criteria());
  fail = true;
  const retained = await live.refreshLiveTrailPackCatalog(criteria());
  assert.deepStrictEqual(retained.trailPacks, good.trailPacks);
  assert.strictEqual(retained.cacheRevision, good.cacheRevision);
  assert.strictEqual(retained.searchMeta.additionalMatchesExist, true);
  assert.strictEqual(retained.status, 'ready');
  assert.match(retained.error, /provider failed/);

  reset(async () => ({ data: { ok: true, records: 'bad', meta: {} }, error: null }));
  const malformed = await live.refreshLiveTrailPackCatalog(criteria());
  assert.strictEqual(malformed.status, 'error');
  assert.strictEqual(malformed.trailPacks.length, 0);

  reset(async () => response([route(1)], { nextPage: 2 }));
  const continuation = await live.refreshLiveTrailPackCatalog(criteria());
  assert.strictEqual(continuation.status, 'error');
  assert.strictEqual(continuation.searchMeta, null);
}

async function lifecycleAndPartitions() {
  const pending = [];
  reset(() => { const next = deferred(); pending.push(next); return next.promise; });
  const initial = live.refreshLiveTrailPackCatalog(criteria());
  live.suspendLiveTrailPackCatalog();
  pending[0].resolve(response([route(1)]));
  await initial;
  assert.strictEqual(live.liveTrailPackCatalogStore.getSnapshot().trailPacks.length, 0);
  assert.notStrictEqual(live.liveTrailPackCatalogStore.getSnapshot().status, 'loading');
  const resumed = live.resumeLiveTrailPackCatalog();
  assert.strictEqual(pending.length, 2, 'foreground resume must dispatch one authoritative revalidation');
  pending[1].resolve(response([route(2)]));
  await resumed;
  assert.strictEqual(live.liveTrailPackCatalogStore.getSnapshot().trailPacks[0].id, 'acceptance-002');

  let failAnonymous = false;
  reset(async (_body, value) => {
    if (value.accessPartition === 'authenticated') return response([route(3)]);
    return failAnonymous ? { data: null, error: { message: 'anonymous unavailable' } } : response([route(4)]);
  });
  await live.refreshLiveTrailPackCatalog(criteria({ accessPartition: 'authenticated' }));
  failAnonymous = true;
  const anonymous = await live.refreshLiveTrailPackCatalog(criteria({ accessPartition: 'anonymous' }));
  assert.strictEqual(anonymous.status, 'error');
  assert.strictEqual(anonymous.trailPacks.length, 0);
  assert.strictEqual(anonymous.accessPartition, 'anonymous');
}

function navigationOrdering() {
  performance.resetExplorePerformanceRecords();
  const events = [];
  navigation.dispatchSummaryFirstTripBuilderNavigation({
    route: { id: 'summary' },
    stageReadiness: () => events.push('summary-handoff'),
    stageItinerary: () => events.push('itinerary-handoff'),
    clearTransientUi: () => events.push('ui-cleared'),
    navigate: () => events.push('navigation'),
  });
  events.push('detail-start');
  assert.deepStrictEqual(events, ['summary-handoff', 'itinerary-handoff', 'ui-cleared', 'navigation', 'detail-start']);
  const marks = performance.getExplorePerformanceRecords().map((item) => item.event);
  assert.deepStrictEqual(marks, ['explore_route_card_press_received', 'explore_trip_builder_navigation_dispatched']);
}

async function run() {
  await sharingAndNormalization();
  await fingerprintSeparation();
  await staleResponseCases();
  await lastGoodAndMalformedContracts();
  await lifecycleAndPartitions();
  navigationOrdering();
  console.log('Explore client-orchestration acceptance checks passed (18 behavioral requirements).');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

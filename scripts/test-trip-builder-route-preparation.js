const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
global.__DEV__ = false;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'web' } };
  if (
    request === './liveTrailPackCatalog' &&
    parent?.filename.endsWith(path.join('lib', 'explore', 'exploreTripBuilderRouteDetail.ts'))
  ) {
    return {
      fetchRouteCatalogTrailPackDetail: async () => {
        throw new Error('Unexpected default provider call in deterministic Trip Builder test.');
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

require.extensions['.ts'] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(transpiled.outputText, filename);
};

const {
  TRIP_BUILDER_CANONICAL_ROUTE_SESSION_VERSION,
  beginTripBuilderRoutePreparation,
  cancelTripBuilderRoutePreparation,
  completeTripBuilderRoutePreparationFromPracticalEntry,
  completeTripBuilderRoutePreparation,
  continueTripBuilderRoutePreparation,
  createTripBuilderRoutePreparationState,
  getTripBuilderNavigationHandoffUnavailableReason,
  restoreTripBuilderRoutePreparation,
  resolvePracticalTripBuilderTrailheadSelection,
  selectTripBuilderPreparationTrailhead,
  tripBuilderRoutePreparationToAsyncState,
  tripBuilderRouteFromImport,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderRoutePreparation.ts'));
const {
  resolveECSAsyncSurfacePresentation,
} = require(path.join(root, 'lib', 'state', 'asyncSurfacePresentation.ts'));
const {
  classifyExploreRouteAvailability,
} = require(path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'));
const {
  buildTripPlan,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderService.ts'));
const {
  buildTripItineraryFromSuggestedRoute,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryBuilderService.ts'));
const {
  applyTripItineraryEditSession,
  createTripItineraryEditSession,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripItineraryEditSession.ts'));
const {
  buildTripBuilderPlanOutputSpine,
} = require(path.join(root, 'lib', 'tripBuilder', 'tripBuilderPlanOutputSpine.ts'));

function eligibilitySnapshot(route) {
  const availability = classifyExploreRouteAvailability(route);
  return {
    discoverable: availability.discoverability.eligible,
    tripBuilderEligible: availability.tripBuilder.eligible,
    guidanceReady: availability.guidance.eligible,
    exclusionCodes: availability.guidance.exclusionCodes,
    detailState: availability.detailState,
  };
}

function summaryRoute(id = 'summary-route') {
  return {
    id: `trail-pack:${id}`,
    name: 'Summary Route',
    description: 'Safe summary metadata for a route selected in Explore.',
    region: 'Regression Range',
    distanceMiles: 24,
    estimatedDays: 1,
    startLat: 38.5002,
    startLng: -109.6002,
    coordinate: { lat: 38.5002, lng: -109.6002 },
    routeMetadata: {
      source: 'trail_pack',
      trailPackId: id,
      trailPackDataState: 'live',
      routeCatalogSourceVersion: '2026-07-16T00:00:00.000Z',
      routeCatalogSummaryAnchorKind: 'trailhead',
      routeGeometryMode: 'omitted',
      reviewStatus: 'approved',
      legalAccessStatus: 'verified',
      catalogVerification: {
        publicRecommendation: true,
        blockers: [],
        warnings: ['Coordinates omitted from lightweight search.'],
      },
    },
  };
}

function detailTrailPack(id = 'summary-route', overrides = {}) {
  return {
    id,
    name: 'Summary Route',
    source: 'ecs_validated',
    routeType: 'point_to_point',
    centerCoordinate: { latitude: 38.55, longitude: -109.55 },
    // Provider order is intentionally backward relative to the summary trailhead.
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.5, 38.6],
        [-109.55, 38.55],
        [-109.6, 38.5],
      ],
    },
    routeGeometryMode: 'full',
    dataState: 'live',
    distanceMiles: 24,
    confidenceScore: 90,
    confidenceReasons: ['Official source record.'],
    reviewStatus: 'approved',
    catalogVerification: {
      status: 'normal',
      sourceLabel: 'Official access verified',
      publicRecommendation: true,
      confidenceScore: 90,
      warnings: [],
      blockers: [],
      dataUsed: [],
      lastEvaluatedAt: '2026-07-16T00:00:00.000Z',
    },
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function shortSummaryRoute(id = 'short-summary-route') {
  return {
    ...summaryRoute(id),
    name: 'Two Mile Summary Route',
    distanceMiles: 2,
  };
}

function shortDetailTrailPack(id = 'short-summary-route', overrides = {}) {
  return detailTrailPack(id, {
    name: 'Two Mile Summary Route',
    distanceMiles: 2,
    ...overrides,
  });
}

function lineCoordinates(route) {
  return route.routeGeometry.coordinates;
}

(async () => {
  const idle = createTripBuilderRoutePreparationState();
  const summary = summaryRoute();
  const started = beginTripBuilderRoutePreparation(idle, summary, 1000);
  assert.strictEqual(started.status, 'loading_detail');
  assert.strictEqual(started.routeId, summary.id);
  assert.strictEqual(started.detailRoute, null);
  assert.ok(getTripBuilderNavigationHandoffUnavailableReason(started));

  let providerCalls = 0;
  const awaiting = await continueTripBuilderRoutePreparation(started, summary, {
    now: 2000,
    fetchDetail: async (routeId, options) => {
      providerCalls += 1;
      assert.strictEqual(routeId, 'summary-route');
      assert.strictEqual(options.sourceVersion, '2026-07-16T00:00:00.000Z');
      return detailTrailPack();
    },
  });
  assert.strictEqual(providerCalls, 1);
  assert.strictEqual(awaiting.status, 'awaiting_trailhead_selection');
  assert.strictEqual(awaiting.safeErrorCode, 'TRIP_BUILDER_TRAILHEAD_REQUIRED');
  assert.ok(awaiting.trailheadOptions.length >= 2);
  assert.strictEqual(awaiting.canonicalRoute, null);

  const suggestedTrailhead = awaiting.trailheadOptions.find((option) => option.suggested);
  assert.ok(suggestedTrailhead, 'Provider route must expose a suggested trailhead candidate.');
  assert.strictEqual(
    suggestedTrailhead.id,
    'summary_trailhead',
    'Detail reconciliation must preserve a summary trailhead that differs from the provider center.',
  );
  assert.deepStrictEqual(
    awaiting.detailRoute.routeMetadata.tripBuilderSummaryTrailheadCandidate,
    { lat: 38.5002, lng: -109.6002 },
  );
  assert.deepStrictEqual(
    resolvePracticalTripBuilderTrailheadSelection(awaiting),
    {
      trailheadId: 'summary_trailhead',
      reason: 'suggested_provider_trailhead',
      requiresManualSelection: false,
    },
    'Explicit suggested provider trailhead evidence should resolve without an endpoint prompt.',
  );
  const practicalProviderReady = completeTripBuilderRoutePreparationFromPracticalEntry(
    awaiting,
    { now: 2500 },
  );
  assert.strictEqual(practicalProviderReady.status, 'ready');
  assert.strictEqual(practicalProviderReady.selectedTrailheadId, 'summary_trailhead');
  const building = selectTripBuilderPreparationTrailhead(awaiting, suggestedTrailhead.id);
  assert.strictEqual(building.status, 'building');
  const ready = completeTripBuilderRoutePreparation(building, 3000);
  assert.strictEqual(ready.status, 'ready');
  assert.strictEqual(
    completeTripBuilderRoutePreparation(
      selectTripBuilderPreparationTrailhead(ready, suggestedTrailhead.id),
      3001,
    ),
    ready,
    'A repeated trailhead activation must not demote or rebuild a ready route.',
  );
  assert.strictEqual(getTripBuilderNavigationHandoffUnavailableReason(ready), null);
  assert.strictEqual(
    ready.canonicalRoute.routeMetadata.tripBuilderCanonicalSessionVersion,
    TRIP_BUILDER_CANONICAL_ROUTE_SESSION_VERSION,
  );
  assert.strictEqual(ready.canonicalRoute.routeMetadata.tripBuilderCanonicalState, 'ready');
  assert.deepStrictEqual(
    lineCoordinates(ready.canonicalRoute)[0],
    [-109.6, 38.5],
    'Canonical route must reverse provider geometry when the selected trailhead is at the provider end.',
  );
  assert.deepStrictEqual(ready.canonicalRoute.routeMetadata.tripBuilderTrailStart, {
    lat: 38.5,
    lng: -109.6,
  });
  assert.deepStrictEqual(ready.canonicalRoute.routeMetadata.tripBuilderTrailEnd, {
    lat: 38.6,
    lng: -109.5,
  });
  assert.deepStrictEqual(ready.canonicalRoute.trailheadStart, {
    latitude: 38.5002,
    longitude: -109.6002,
  });

  const shortSummary = shortSummaryRoute();
  const shortSummaryAvailability = classifyExploreRouteAvailability(shortSummary);
  assert.strictEqual(shortSummaryAvailability.discoverability.eligible, true);
  assert.strictEqual(shortSummaryAvailability.tripBuilder.eligible, true);
  assert.strictEqual(shortSummaryAvailability.guidance.eligible, false);
  assert.ok(shortSummaryAvailability.guidance.exclusionCodes.includes('too_short'));
  assert.ok(shortSummaryAvailability.guidance.exclusionCodes.includes('missing_geometry'));

  const shortStarted = beginTripBuilderRoutePreparation(idle, shortSummary, 3500);
  assert.strictEqual(shortStarted.status, 'loading_detail');
  assert.strictEqual(shortStarted.routeId, shortSummary.id);
  assert.strictEqual(shortStarted.summaryRoute, shortSummary);
  const shortAwaiting = await continueTripBuilderRoutePreparation(shortStarted, shortSummary, {
    now: 3600,
    fetchDetail: async (routeId) => {
      assert.strictEqual(routeId, 'short-summary-route');
      return shortDetailTrailPack();
    },
  });
  assert.notStrictEqual(
    shortAwaiting.status,
    'empty_invalid',
    'A valid short route must not become terminally invalid after detail hydration.',
  );
  assert.strictEqual(shortAwaiting.status, 'awaiting_trailhead_selection');
  assert.strictEqual(shortAwaiting.routeId, shortSummary.id);
  assert.strictEqual(shortAwaiting.summaryRoute, shortSummary);
  assert.strictEqual(shortAwaiting.summaryRoute.distanceMiles, 2);
  assert.ok(shortAwaiting.detailRoute, 'Valid detail hydration must retain the selected short route.');

  const shortHydratedAvailability = classifyExploreRouteAvailability(shortAwaiting.detailRoute);
  assert.strictEqual(shortHydratedAvailability.discoverability.eligible, true);
  assert.strictEqual(shortHydratedAvailability.tripBuilder.eligible, true);
  assert.strictEqual(shortHydratedAvailability.guidance.eligible, false);
  assert.deepStrictEqual(shortHydratedAvailability.guidance.exclusionCodes, ['too_short']);
  assert.strictEqual(shortHydratedAvailability.detailState, 'ready');

  const shortReady = completeTripBuilderRoutePreparationFromPracticalEntry(
    shortAwaiting,
    { now: 3700 },
  );
  assert.strictEqual(shortReady.status, 'ready');
  assert.strictEqual(shortReady.routeId, shortSummary.id);
  assert.strictEqual(shortReady.summaryRoute, shortSummary);
  assert.strictEqual(shortReady.canonicalRoute.distanceMiles, 2);
  assert.strictEqual(getTripBuilderNavigationHandoffUnavailableReason(shortReady), null);
  const shortCanonicalAvailability = classifyExploreRouteAvailability(shortReady.canonicalRoute);
  assert.strictEqual(shortCanonicalAvailability.discoverability.eligible, true);
  assert.strictEqual(shortCanonicalAvailability.tripBuilder.eligible, true);
  assert.strictEqual(shortCanonicalAvailability.guidance.eligible, false);
  assert.deepStrictEqual(shortCanonicalAvailability.guidance.exclusionCodes, ['too_short']);

  const shortRouteBeforeSmartResupply = JSON.stringify(shortReady.canonicalRoute);
  const shortEligibilityBeforeSmartResupply = eligibilitySnapshot(shortReady.canonicalRoute);
  const shortTripPlan = buildTripPlan({
    route: shortReady.canonicalRoute,
    input: {
      tripType: 'day_trip',
      timeWindow: 'full_day',
      groupType: 'solo',
      priorities: [],
    },
    capturedAt: '2026-07-18T12:00:00.000Z',
  });
  assert.strictEqual(shortTripPlan.route.routeId, shortReady.canonicalRoute.id);
  assert.strictEqual(shortTripPlan.route.distanceMiles, 2);
  assert.ok(shortTripPlan.smartResupplyPlan, 'Smart Resupply recomputation should complete for a short route.');
  assert.ok(
    shortTripPlan.suggestedStops.some((stop) => stop.type === 'start') &&
      shortTripPlan.suggestedStops.some((stop) => stop.type === 'finish'),
    'Trip creation must complete for an eligible short route without guidance readiness.',
  );
  assert.strictEqual(
    JSON.stringify(shortReady.canonicalRoute),
    shortRouteBeforeSmartResupply,
    'Smart Resupply recomputation must not mutate the selected short route.',
  );
  assert.deepStrictEqual(
    eligibilitySnapshot(shortReady.canonicalRoute),
    shortEligibilityBeforeSmartResupply,
    'Smart Resupply recomputation must not change short-route discovery, Trip Builder, or guidance eligibility.',
  );

  const shortItinerary = buildTripItineraryFromSuggestedRoute({
    suggestedRoute: shortReady.canonicalRoute,
    generatedAt: '2026-07-18T12:01:00.000Z',
  });
  assert.strictEqual(shortItinerary.sourceRouteId, shortReady.canonicalRoute.id);
  const shortEditSession = createTripItineraryEditSession(
    shortItinerary,
    '2026-07-18T12:02:00.000Z',
  );
  const shortEditedItinerary = applyTripItineraryEditSession(shortItinerary, shortEditSession);
  assert.ok(shortEditedItinerary, 'A short-route itinerary must remain editable after detail hydration.');
  assert.strictEqual(shortEditedItinerary.sourceRouteId, shortReady.canonicalRoute.id);
  assert.strictEqual(shortEditSession.sourceRouteId, shortReady.canonicalRoute.id);

  const shortOutputSpine = buildTripBuilderPlanOutputSpine({
    route: shortReady.canonicalRoute,
  });
  assert.strictEqual(shortOutputSpine.status, 'trail_only');
  assert.strictEqual(shortOutputSpine.source, 'canonical_trail');
  assert.ok(shortOutputSpine.lineString && shortOutputSpine.coordinates.length >= 2);

  const reloadedShort = restoreTripBuilderRoutePreparation(
    JSON.parse(JSON.stringify(shortReady.canonicalRoute)),
    4,
    3800,
  );
  assert.ok(reloadedShort, 'A Trip Builder draft containing a short route must reload.');
  assert.strictEqual(reloadedShort.status, 'ready');
  assert.strictEqual(reloadedShort.routeId, shortReady.canonicalRoute.id);
  assert.strictEqual(reloadedShort.summaryRoute.id, shortReady.canonicalRoute.id);
  assert.strictEqual(reloadedShort.canonicalRoute.distanceMiles, 2);
  assert.strictEqual(getTripBuilderNavigationHandoffUnavailableReason(reloadedShort), null);
  const reloadedShortAvailability = classifyExploreRouteAvailability(reloadedShort.canonicalRoute);
  assert.strictEqual(reloadedShortAvailability.tripBuilder.eligible, true);
  assert.strictEqual(reloadedShortAvailability.guidance.eligible, false);
  assert.ok(reloadedShortAvailability.guidance.exclusionCodes.includes('too_short'));

  const browserStorage = new Map();
  global.localStorage = {
    getItem: (key) => browserStorage.get(key) ?? null,
    setItem: (key, value) => browserStorage.set(key, String(value)),
    removeItem: (key) => browserStorage.delete(key),
  };
  const handoffStorePath = path.join(root, 'lib', 'tripBuilder', 'tripBuilderRouteHandoffStore.ts');
  delete require.cache[require.resolve(handoffStorePath)];
  const firstHandoffStore = require(handoffStorePath);
  firstHandoffStore.saveTripBuilderRouteHandoff(shortReady.canonicalRoute, {
    createdAt: '2026-07-18T12:03:00.000Z',
    deferItineraryBuild: true,
    userLocation: { latitude: 37.81, longitude: -110.31, accuracyMeters: 15 },
  });
  delete require.cache[require.resolve(handoffStorePath)];
  const shortRestartedHandoffStore = require(handoffStorePath);
  const hydratedShortHandoff = await shortRestartedHandoffStore.loadTripBuilderRouteHandoffAsync();
  assert.strictEqual(hydratedShortHandoff.route.id, shortReady.canonicalRoute.id);
  assert.strictEqual(hydratedShortHandoff.draftItinerary, null);
  assert.deepStrictEqual(
    hydratedShortHandoff.userLocation,
    { latitude: 37.81, longitude: -110.31, accuracyMeters: 15 },
    'A deferred Explorer origin must survive handoff-store hydration without requiring a new Trip Builder GPS fix.',
  );
  const restoredShortHandoff = restoreTripBuilderRoutePreparation(
    hydratedShortHandoff.route,
    10,
    3900,
  );
  assert.ok(restoredShortHandoff);
  assert.strictEqual(restoredShortHandoff.status, 'ready');
  assert.deepStrictEqual(
    eligibilitySnapshot(restoredShortHandoff.canonicalRoute),
    shortEligibilityBeforeSmartResupply,
    'A persisted short-route handoff must retain guidance-only too_short semantics.',
  );

  const planStorePath = path.join(root, 'lib', 'tripBuilder', 'tripBuilderPlanStore.ts');
  delete require.cache[require.resolve(planStorePath)];
  const firstPlanStore = require(planStorePath);
  await firstPlanStore.saveTripBuilderPlanState({
    selectedRouteId: shortReady.canonicalRoute.id,
    plan: shortTripPlan,
    visible: true,
    itinerarySaved: true,
    itineraryEditSession: shortEditSession,
  });
  delete require.cache[require.resolve(planStorePath)];
  const restartedPlanStore = require(planStorePath);
  const hydratedShortPlanState = await restartedPlanStore.loadTripBuilderPlanState();
  assert.strictEqual(hydratedShortPlanState.selectedRouteId, shortReady.canonicalRoute.id);
  assert.strictEqual(hydratedShortPlanState.plan.route.routeId, shortReady.canonicalRoute.id);
  assert.strictEqual(hydratedShortPlanState.plan.route.distanceMiles, 2);
  assert.strictEqual(hydratedShortPlanState.itineraryEditSession.sourceRouteId, shortReady.canonicalRoute.id);

  const routeStorePath = path.join(root, 'lib', 'routeStore.ts');
  delete require.cache[require.resolve(routeStorePath)];
  const { routeStore } = require(routeStorePath);
  const savedShortRoute = routeStore.createCustomRoute([{
    coordinates: shortOutputSpine.coordinates.map((point) => [
      point.longitude,
      point.latitude,
    ]),
    sourceMetadata: {
      kind: 'snapped_trace',
      sourceLabel: 'ecs_trip_builder_plan',
      confidence: 'planning_geometry',
      dataState: 'cached_geometry',
      warnings: ['Synthetic short-route save regression.'],
      guidanceReady: true,
    },
  }], {
    name: shortTripPlan.route.name,
    sourceApp: 'ecs_trip_builder',
    externalSourceId: shortTripPlan.id,
    externalSourceType: 'trip_plan',
    idempotencyKey: `trip-builder:${shortTripPlan.id}`,
    updateExisting: true,
  });
  assert.strictEqual(savedShortRoute.external_source_id, shortTripPlan.id);
  assert.ok(savedShortRoute.segments[0].points.length >= 2);
  assert.deepStrictEqual(
    eligibilitySnapshot(shortReady.canonicalRoute),
    shortEligibilityBeforeSmartResupply,
    'Saving a derived itinerary route must not relabel the selected short source route.',
  );

  shortRestartedHandoffStore.saveTripBuilderRouteHandoff(ready.canonicalRoute, {
    createdAt: '2026-07-16T12:00:00.000Z',
  });
  delete require.cache[require.resolve(handoffStorePath)];
  const restartedHandoffStore = require(handoffStorePath);
  const hydratedHandoff = await restartedHandoffStore.loadTripBuilderRouteHandoffAsync();
  assert.strictEqual(hydratedHandoff.route.id, ready.canonicalRoute.id);
  assert.strictEqual(
    restoreTripBuilderRoutePreparation(hydratedHandoff.route, 10, 4000).status,
    'ready',
    'A restarted Trip Builder session must hydrate the persisted canonical route without provider detail.',
  );
  const { buildExploreNavigationPayload } = require(path.join(root, 'lib', 'navigationHandoffStore.ts'));
  const navigationPayload = buildExploreNavigationPayload(ready.canonicalRoute, {
    approachOriginCoordinate: { lat: 38.6, lng: -109.5 },
  });
  assert.deepStrictEqual(
    navigationPayload.trailGeometry[0],
    { lat: 38.5, lng: -109.6 },
    'A GPS/approach point near the route end must not reverse confirmed canonical orientation.',
  );
  assert.deepStrictEqual(
    navigationPayload.trailheadCoordinate,
    { lat: 38.5002, lng: -109.6002 },
    'Navigate approach should retain the selected trailhead while guidance uses canonical geometry.',
  );

  const restored = restoreTripBuilderRoutePreparation(
    JSON.parse(JSON.stringify(ready.canonicalRoute)),
    9,
    4000,
  );
  assert.strictEqual(restored.status, 'ready');
  assert.strictEqual(restored.generation, 9);
  assert.strictEqual(getTripBuilderNavigationHandoffUnavailableReason(restored), null);
  assert.strictEqual(tripBuilderRoutePreparationToAsyncState(restored).source, 'cached');
  assert.strictEqual(
    tripBuilderRoutePreparationToAsyncState(restored).freshness,
    'stale',
    'A restored canonical session remains cached/stale until current catalog truth validates it.',
  );
  const tamperedCanonicalRoute = JSON.parse(JSON.stringify(ready.canonicalRoute));
  tamperedCanonicalRoute.routeMetadata.tripBuilderCanonicalGeometryFingerprint = 'tampered';
  assert.strictEqual(
    restoreTripBuilderRoutePreparation(tamperedCanonicalRoute, 9, 4000),
    null,
    'Hydration must reject a canonical-session fingerprint mismatch.',
  );
  const incompleteCanonicalRoute = JSON.parse(JSON.stringify(ready.canonicalRoute));
  delete incompleteCanonicalRoute.routeMetadata.tripBuilderSelectedTrailhead;
  assert.strictEqual(
    restoreTripBuilderRoutePreparation(incompleteCanonicalRoute, 9, 4000),
    null,
    'Hydration must reject a ready marker without its selected trailhead contract.',
  );
  let warmProviderCalls = 0;
  const warmStarted = beginTripBuilderRoutePreparation(restored, restored.canonicalRoute, 4100);
  assert.strictEqual(warmStarted.status, 'ready', 'A warm canonical session should not flash a loading state.');
  const warmRepeat = await continueTripBuilderRoutePreparation(
    warmStarted,
    restored.canonicalRoute,
    {
      fetchDetail: async () => {
        warmProviderCalls += 1;
        throw new Error('A reconciled canonical session must not fetch detail again.');
      },
    },
  );
  assert.strictEqual(warmRepeat.status, 'ready');
  assert.strictEqual(warmProviderCalls, 0);

  const empty = await continueTripBuilderRoutePreparation(
    beginTripBuilderRoutePreparation(idle, summaryRoute('empty'), 5000),
    summaryRoute('empty'),
    { fetchDetail: async () => null, now: 5100 },
  );
  assert.strictEqual(empty.status, 'empty_invalid');
  assert.strictEqual(empty.safeErrorCode, 'TRIP_BUILDER_ROUTE_DETAIL_EMPTY');
  assert.strictEqual(empty.retryEligible, true);
  assert.strictEqual(
    tripBuilderRoutePreparationToAsyncState(empty).status,
    'error',
    'Provider-empty route detail must retain a retryable failure presentation rather than No results.',
  );
  assert.strictEqual(
    resolveECSAsyncSurfacePresentation(
      tripBuilderRoutePreparationToAsyncState(empty),
      { subject: 'canonical route preparation' },
    ).showRetry,
    true,
  );

  const invalid = await continueTripBuilderRoutePreparation(
    beginTripBuilderRoutePreparation(idle, summaryRoute('invalid'), 5200),
    summaryRoute('invalid'),
    { fetchDetail: async () => detailTrailPack('invalid', { routeGeometry: undefined }), now: 5300 },
  );
  assert.strictEqual(invalid.status, 'empty_invalid');
  assert.strictEqual(invalid.safeErrorCode, 'TRIP_BUILDER_ROUTE_GEOMETRY_INVALID');

  const failedStarted = beginTripBuilderRoutePreparation(idle, summaryRoute('failure'), 5400);
  const failed = await continueTripBuilderRoutePreparation(failedStarted, summaryRoute('failure'), {
    fetchDetail: async () => {
      throw new Error('Provider transport failure');
    },
    now: 5500,
  });
  assert.strictEqual(failed.status, 'retryable_error');
  assert.strictEqual(failed.safeErrorCode, 'TRIP_BUILDER_ROUTE_PROVIDER_UNAVAILABLE');
  assert.strictEqual(failed.retryEligible, true);
  const retry = beginTripBuilderRoutePreparation(failed, summaryRoute('failure'), 5600);
  assert.strictEqual(retry.requestFingerprint, failedStarted.requestFingerprint);
  assert.notStrictEqual(retry.requestId, failedStarted.requestId);
  let retryProviderCalls = 0;
  const retried = await continueTripBuilderRoutePreparation(retry, summaryRoute('failure'), {
    fetchDetail: async () => {
      retryProviderCalls += 1;
      return detailTrailPack('failure');
    },
    now: 5650,
  });
  assert.strictEqual(retryProviderCalls, 1, 'Retry must execute a fresh provider request.');
  assert.strictEqual(retried.status, 'awaiting_trailhead_selection');
  assert.strictEqual(retried.requestFingerprint, failedStarted.requestFingerprint);

  let offlineProviderCalls = 0;
  const offline = await continueTripBuilderRoutePreparation(
    beginTripBuilderRoutePreparation(idle, summaryRoute('offline'), 5700),
    summaryRoute('offline'),
    {
      offline: true,
      fetchDetail: async () => {
        offlineProviderCalls += 1;
        throw new Error('Offline preparation must not call the provider.');
      },
      readCachedDetail: async () => null,
      now: 5800,
    },
  );
  assert.strictEqual(offline.status, 'offline_unavailable');
  assert.strictEqual(offline.safeErrorCode, 'TRIP_BUILDER_ROUTE_OFFLINE_UNAVAILABLE');
  assert.strictEqual(
    tripBuilderRoutePreparationToAsyncState(offline).status,
    'error',
    'Offline without cached geometry must render unavailable, not partial success.',
  );
  assert.strictEqual(offlineProviderCalls, 0);

  const offlineCached = await continueTripBuilderRoutePreparation(
    beginTripBuilderRoutePreparation(idle, summaryRoute('offline-cached'), 5810),
    summaryRoute('offline-cached'),
    {
      offline: true,
      fetchDetail: async () => {
        throw new Error('A warm offline repeat must not call the provider.');
      },
      readCachedDetail: async () => detailTrailPack('offline-cached'),
      now: 5820,
    },
  );
  assert.strictEqual(
    offlineCached.status,
    'awaiting_trailhead_selection',
    'A valid warm detail cache must remain usable while offline.',
  );

  const controller = new AbortController();
  controller.abort('consumer_cancelled');
  const cancelled = await continueTripBuilderRoutePreparation(
    beginTripBuilderRoutePreparation(idle, summaryRoute('cancelled'), 5900),
    summaryRoute('cancelled'),
    { signal: controller.signal, now: 6000 },
  );
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.strictEqual(cancelled.safeErrorCode, 'TRIP_BUILDER_ROUTE_CANCELLED');
  assert.strictEqual(cancelled.canonicalRoute, null);
  assert.strictEqual(tripBuilderRoutePreparationToAsyncState(cancelled).status, 'cancelled');
  assert.strictEqual(
    cancelTripBuilderRoutePreparation(awaiting, 6100).status,
    'cancelled',
    'An awaiting preparation must also terminate explicitly when the user cancels.',
  );

  let releaseInFlightDetail;
  let markInFlightDetailStarted;
  const inFlightDetailStarted = new Promise((resolve) => {
    markInFlightDetailStarted = resolve;
  });
  const inFlightController = new AbortController();
  const inFlightStarted = beginTripBuilderRoutePreparation(idle, summaryRoute('in-flight-cancel'), 6110);
  const inFlightRequest = continueTripBuilderRoutePreparation(
    inFlightStarted,
    summaryRoute('in-flight-cancel'),
    {
      signal: inFlightController.signal,
      fetchDetail: async () => new Promise((resolve) => {
        releaseInFlightDetail = () => resolve(detailTrailPack('in-flight-cancel'));
        markInFlightDetailStarted();
      }),
      readCachedDetail: async () => null,
      now: 6120,
    },
  );
  await inFlightDetailStarted;
  inFlightController.abort('route_replaced');
  releaseInFlightDetail();
  const cancelledInFlight = await inFlightRequest;
  assert.strictEqual(cancelledInFlight.status, 'cancelled');
  assert.strictEqual(cancelledInFlight.canonicalRoute, null);
  const sharedOwnerAbort = new Error('Catalog detail request was superseded.');
  sharedOwnerAbort.name = 'AbortError';
  const cancelledBySharedOwner = await continueTripBuilderRoutePreparation(
    beginTripBuilderRoutePreparation(idle, summaryRoute('shared-owner-cancel'), 6125),
    summaryRoute('shared-owner-cancel'),
    {
      fetchDetail: async () => {
        throw sharedOwnerAbort;
      },
      readCachedDetail: async () => null,
      now: 6126,
    },
  );
  assert.strictEqual(
    cancelledBySharedOwner.status,
    'cancelled',
    'A shared catalog owner AbortError must remain cancellation even when this consumer signal is open.',
  );

  let releaseOlderDetail;
  let markOlderDetailStarted;
  const olderDetailStarted = new Promise((resolve) => {
    markOlderDetailStarted = resolve;
  });
  const olderStarted = beginTripBuilderRoutePreparation(idle, summaryRoute('older-selection'), 6130);
  const olderRequest = continueTripBuilderRoutePreparation(
    olderStarted,
    summaryRoute('older-selection'),
    {
      fetchDetail: async () => new Promise((resolve) => {
        releaseOlderDetail = () => resolve(detailTrailPack('older-selection'));
        markOlderDetailStarted();
      }),
      readCachedDetail: async () => null,
      now: 6140,
    },
  );
  await olderDetailStarted;
  const newerRoute = summaryRoute('newer-selection');
  const newerStarted = beginTripBuilderRoutePreparation(olderStarted, newerRoute, 6150);
  let mountedRequestId = newerStarted.requestId;
  let mountedState = await continueTripBuilderRoutePreparation(newerStarted, newerRoute, {
    fetchDetail: async () => detailTrailPack('newer-selection'),
    now: 6160,
  });
  releaseOlderDetail();
  const olderResult = await olderRequest;
  if (olderResult.requestId === mountedRequestId) mountedState = olderResult;
  assert.strictEqual(mountedState.routeId, newerRoute.id);
  assert.notStrictEqual(olderResult.requestId, mountedRequestId);

  const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="ecs-test"><trk><name>Imported Canonical Route</name><trkseg><trkpt lat="38.7" lon="-109.7"><ele>1200</ele></trkpt><trkpt lat="38.75" lon="-109.65"><ele>1250</ele></trkpt><trkpt lat="38.8" lon="-109.6"><ele>1230</ele></trkpt></trkseg></trk></gpx>`;
  assert.throws(
    () => tripBuilderRouteFromImport({ fileName: 'operator-route.txt', content: gpx }),
    /Unsupported file type/,
    'Trip Builder should preserve the existing supported route-file boundary.',
  );
  const supportedImportFixtures = [
    { fileName: 'operator-route.xml', content: gpx },
    {
      fileName: 'operator-route.kml',
      content: '<kml><Document><name>Imported KML</name><Placemark><LineString><coordinates>-109.7,38.7 -109.65,38.75 -109.6,38.8</coordinates></LineString></Placemark></Document></kml>',
    },
    {
      fileName: 'operator-route.geojson',
      content: JSON.stringify({
        type: 'Feature',
        properties: { name: 'Imported GeoJSON' },
        geometry: {
          type: 'LineString',
          coordinates: [[-109.7, 38.7], [-109.65, 38.75], [-109.6, 38.8]],
        },
      }),
    },
    {
      fileName: 'operator-route.json',
      content: JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { name: 'Imported JSON Route' },
          geometry: {
            type: 'LineString',
            coordinates: [[-109.7, 38.7], [-109.65, 38.75], [-109.6, 38.8]],
          },
        }],
      }),
    },
  ];
  for (const fixture of supportedImportFixtures) {
    const supportedRoute = tripBuilderRouteFromImport(fixture);
    assert.ok(
      lineCoordinates(supportedRoute).length >= 2,
      `${fixture.fileName} should enter the shared canonical preparation input shape.`,
    );
    assert.strictEqual(
      supportedRoute.elevationGainFt,
      fixture.fileName.endsWith('.xml') ? 164 : undefined,
      'Elevation gain must be derived only when the imported profile is complete.',
    );
  }
  const importedRoute = tripBuilderRouteFromImport({ fileName: 'operator-route.gpx', content: gpx });
  assert.strictEqual(importedRoute.elevationGainFt, 164);
  const connectedMultipartGpx = `<?xml version="1.0"?><gpx version="1.1" creator="ecs-test"><trk><name>Connected Multipart</name><trkseg><trkpt lat="38.69" lon="-109.71"/><trkpt lat="38.7" lon="-109.7"/></trkseg><trkseg><trkpt lat="38.7002" lon="-109.6998"/><trkpt lat="38.71" lon="-109.69"/></trkseg></trk></gpx>`;
  const connectedMultipartRoute = tripBuilderRouteFromImport({
    fileName: 'connected-multipart.gpx',
    content: connectedMultipartGpx,
  });
  assert.strictEqual(
    connectedMultipartRoute.routeGeometry.type,
    'MultiLineString',
    'Trip Builder must retain connected GPX source-segment topology before canonical preparation.',
  );
  assert.strictEqual(
    connectedMultipartRoute.routeMetadata.sourceGeometrySegmentCount,
    2,
  );
  const connectedMultipartAwaiting = await continueTripBuilderRoutePreparation(
    beginTripBuilderRoutePreparation(idle, connectedMultipartRoute, 6170),
    connectedMultipartRoute,
    { now: 6180 },
  );
  const connectedMultipartReady = completeTripBuilderRoutePreparation(
    selectTripBuilderPreparationTrailhead(
      connectedMultipartAwaiting,
      connectedMultipartAwaiting.trailheadOptions[0].id,
    ),
    6190,
  );
  assert.strictEqual(connectedMultipartReady.status, 'ready');
  assert.strictEqual(connectedMultipartReady.canonicalRoute.routeGeometry.type, 'LineString');

  const disconnectedMultipartGpx = `<?xml version="1.0"?><gpx version="1.1" creator="ecs-test"><trk><name>Disconnected Multipart</name><trkseg><trkpt lat="38.7" lon="-109.7"/><trkpt lat="38.701" lon="-109.699"/></trkseg><trkseg><trkpt lat="39.3" lon="-109.1"/><trkpt lat="39.301" lon="-109.099"/></trkseg></trk></gpx>`;
  assert.throws(
    () => tripBuilderRouteFromImport({
      fileName: 'disconnected-multipart.gpx',
      content: disconnectedMultipartGpx,
    }),
    /disconnected|invent a connector/i,
    'Trip Builder must terminate a disconnected GPX import instead of canonicalizing a fabricated cross-map segment.',
  );
  const importedAwaiting = await continueTripBuilderRoutePreparation(
    beginTripBuilderRoutePreparation(idle, importedRoute, 6200),
    importedRoute,
    { now: 6300 },
  );
  assert.strictEqual(importedAwaiting.status, 'awaiting_trailhead_selection');
  assert.deepStrictEqual(
    resolvePracticalTripBuilderTrailheadSelection(importedAwaiting),
    {
      trailheadId: 'route_start',
      reason: 'imported_route_start_default',
      requiresManualSelection: false,
    },
    'An imported route without a trip origin should preserve source order and use route_start.',
  );
  const practicalImportedReady = completeTripBuilderRoutePreparationFromPracticalEntry(
    importedAwaiting,
    { now: 6350 },
  );
  assert.strictEqual(practicalImportedReady.status, 'ready');
  assert.strictEqual(practicalImportedReady.selectedTrailheadId, 'route_start');
  assert.deepStrictEqual(
    lineCoordinates(practicalImportedReady.canonicalRoute)[0],
    lineCoordinates(importedRoute)[0],
    'The imported/no-origin default must not reverse valid source geometry.',
  );
  const importedRouteStart = importedAwaiting.trailheadOptions.find((option) => option.id === 'route_start');
  const importedRouteEndForOrigin = importedAwaiting.trailheadOptions.find((option) => option.id === 'route_end');
  assert.ok(importedRouteStart && importedRouteEndForOrigin);
  const nearestEndSelection = resolvePracticalTripBuilderTrailheadSelection(
    importedAwaiting,
    {
      lat: importedRouteEndForOrigin.coordinate.lat + 0.0001,
      lng: importedRouteEndForOrigin.coordinate.lng + 0.0001,
    },
  );
  assert.strictEqual(nearestEndSelection.trailheadId, 'route_end');
  assert.strictEqual(nearestEndSelection.reason, 'nearest_endpoint_to_origin');
  const nearestEndReady = completeTripBuilderRoutePreparationFromPracticalEntry(
    importedAwaiting,
    {
      origin: {
        lat: importedRouteEndForOrigin.coordinate.lat + 0.0001,
        lng: importedRouteEndForOrigin.coordinate.lng + 0.0001,
      },
      now: 6375,
    },
  );
  assert.strictEqual(nearestEndReady.status, 'ready');
  assert.deepStrictEqual(
    lineCoordinates(nearestEndReady.canonicalRoute)[0].slice(0, 2),
    [importedRouteEndForOrigin.coordinate.lng, importedRouteEndForOrigin.coordinate.lat],
    'The endpoint nearest the supplied trip origin should orient the canonical route.',
  );
  const midpointOrigin = {
    lat: (importedRouteStart.coordinate.lat + importedRouteEndForOrigin.coordinate.lat) / 2,
    lng: (importedRouteStart.coordinate.lng + importedRouteEndForOrigin.coordinate.lng) / 2,
  };
  const ambiguousSelection = resolvePracticalTripBuilderTrailheadSelection(
    importedAwaiting,
    midpointOrigin,
  );
  assert.strictEqual(ambiguousSelection.trailheadId, 'route_start');
  assert.strictEqual(ambiguousSelection.reason, 'imported_route_start_default');
  assert.strictEqual(ambiguousSelection.requiresManualSelection, false);
  assert.strictEqual(
    completeTripBuilderRoutePreparationFromPracticalEntry(importedAwaiting, { origin: midpointOrigin }).status,
    'ready',
    'An equidistant or looped GPX should preserve its authored start instead of requiring an endpoint-reference prompt.',
  );
  const importedBuilding = selectTripBuilderPreparationTrailhead(
    importedAwaiting,
    importedAwaiting.trailheadOptions[0].id,
  );
  const importedReady = completeTripBuilderRoutePreparation(importedBuilding, 6400);
  assert.strictEqual(importedReady.status, 'ready');
  assert.strictEqual(importedReady.source, 'import');
  assert.strictEqual(importedReady.canonicalRoute.routeMetadata.tripBuilderCanonicalState, 'ready');
  assert.deepStrictEqual(
    lineCoordinates(importedReady.canonicalRoute).map((coordinate) => coordinate[2]),
    [1200, 1250, 1230],
    'Canonical preparation must preserve imported elevation ordinates for guidance and terrain analysis.',
  );
  assert.strictEqual(
    importedReady.canonicalRoute.routeMetadata.tripBuilderCanonicalSessionVersion,
    ready.canonicalRoute.routeMetadata.tripBuilderCanonicalSessionVersion,
    'Provider and imported routes must enter the same canonical route-session contract.',
  );
  assert.ok(importedReady.canonicalRoute.routeMetadata.tripBuilderTrailStart);
  assert.ok(importedReady.canonicalRoute.routeMetadata.tripBuilderTrailEnd);
  assert.strictEqual(getTripBuilderNavigationHandoffUnavailableReason(importedReady), null);
  const importedRouteEnd = importedAwaiting.trailheadOptions.find((option) => option.id === 'route_end');
  assert.ok(importedRouteEnd);
  const reverseImportedReady = completeTripBuilderRoutePreparation(
    selectTripBuilderPreparationTrailhead(importedAwaiting, importedRouteEnd.id),
    6500,
  );
  const restoredReverseImport = restoreTripBuilderRoutePreparation(
    JSON.parse(JSON.stringify(reverseImportedReady.canonicalRoute)),
    11,
    6600,
  );
  assert.deepStrictEqual(
    restoredReverseImport.trailheadOptions.find((option) => option.id === 'route_end').coordinate,
    reverseImportedReady.canonicalRoute.routeMetadata.tripBuilderSelectedTrailhead.coordinate,
    'Restored option identity must retain the selected pre-orientation endpoint.',
  );

  console.log('Sanitized short-route acceptance state:', JSON.stringify({
    summary: eligibilitySnapshot(shortSummary),
    hydratedDetail: {
      preparationStatus: shortAwaiting.status,
      selectedRouteRetained: shortAwaiting.routeId === shortSummary.id,
      eligibility: eligibilitySnapshot(shortAwaiting.detailRoute),
    },
    canonicalRoute: {
      preparationStatus: shortReady.status,
      distanceMiles: shortReady.canonicalRoute.distanceMiles,
      eligibility: eligibilitySnapshot(shortReady.canonicalRoute),
    },
    editableItinerary: {
      available: shortEditedItinerary != null,
      selectedRouteRetained: shortEditedItinerary?.sourceRouteId === shortReady.canonicalRoute.id,
    },
    buildAndSave: {
      planBuilt: shortTripPlan.route.routeId === shortReady.canonicalRoute.id,
      planDistanceMiles: shortTripPlan.route.distanceMiles,
      canonicalOutputStatus: shortOutputSpine.status,
      savedOutputPointCount: savedShortRoute.segments[0].points.length,
    },
    reload: {
      preparationStatus: restoredShortHandoff.status,
      planRouteRetained: hydratedShortPlanState.plan.route.routeId === shortReady.canonicalRoute.id,
      eligibility: eligibilitySnapshot(restoredShortHandoff.canonicalRoute),
    },
    smartResupply: {
      computed: shortTripPlan.smartResupplyPlan != null,
      selectedRouteMutated: JSON.stringify(shortReady.canonicalRoute) !== shortRouteBeforeSmartResupply,
      eligibility: eligibilitySnapshot(shortReady.canonicalRoute),
    },
  }, null, 2));
  console.log('Trip Builder canonical route preparation behavior checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

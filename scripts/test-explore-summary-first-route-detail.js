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
        throw new Error('Unexpected default provider call in deterministic test.');
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
  classifyExploreRouteAvailability,
} = require(path.join(root, 'lib', 'explore', 'exploreGuidanceReadyInventory.ts'));
const {
  getResolvedExploreTripBuilderRouteDetail,
  resolveExploreTripBuilderRouteDetail,
} = require(path.join(root, 'lib', 'explore', 'exploreTripBuilderRouteDetail.ts'));
const {
  getExploreTripBuilderEligibility,
  isExploreRouteCatalogDetailDeferred,
} = require(path.join(root, 'lib', 'explore', 'exploreTripBuilderWizard.ts'));
const {
  getDiscoverableTrailPacks,
  routeCatalogSummaryToDeferredOpportunity,
  routeCatalogSummaryToDeferredTrailPack,
} = require(path.join(root, 'lib', 'explore', 'trailPacks.ts'));

function catalogSummary(id = 'cached-summary', overrides = {}) {
  return {
    routeId: id,
    title: 'Cached Summary Route',
    region: 'Regression Range',
    forestName: null,
    distanceMeters: 24 * 1609.344,
    estimatedDurationSeconds: 7200,
    difficulty: 'moderate',
    popularityScore: 4,
    communityRating: null,
    sourceType: 'official',
    bbox: {
      minLng: -109.7,
      minLat: 38.4,
      maxLng: -109.5,
      maxLat: 38.6,
    },
    trailheadCoordinate: { latitude: 38.5, longitude: -109.6 },
    thumbnailUrl: null,
    thumbnailAssetKey: null,
    updatedAt: '2026-07-16T00:00:00.000Z',
    tags: ['route-catalog'],
    ...overrides,
  };
}

function summaryRoute(id = 'summary-route') {
  return {
    id: `trail-pack:${id}`,
    name: 'Summary Route',
    region: 'Regression Range',
    distanceMiles: 24,
    estimatedDays: 1,
    startLat: 38.5,
    startLng: -109.6,
    routeMetadata: {
      source: 'trail_pack',
      trailPackId: id,
      trailPackDataState: 'live',
      routeCatalogSourceVersion: '2026-07-16T00:00:00.000Z',
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

function detailTrailPack(id = 'summary-route') {
  return {
    id,
    name: 'Summary Route',
    source: 'ecs_validated',
    routeType: 'point_to_point',
    centerCoordinate: { latitude: 38.5, longitude: -109.6 },
    routeGeometry: {
      type: 'LineString',
      coordinates: [
        [-109.6, 38.5],
        [-109.55, 38.55],
        [-109.5, 38.6],
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
  };
}

(async () => {
  const summary = summaryRoute();
  let providerCalls = 0;

  const cachedSummaryPack = routeCatalogSummaryToDeferredTrailPack(catalogSummary(), {
    publicRecommendation: true,
    sourceState: 'cached',
  });
  assert(cachedSummaryPack, 'A cached canonical summary with a map anchor should normalize.');
  assert.strictEqual(cachedSummaryPack.catalogVerification.publicRecommendation, true);
  assert.strictEqual(cachedSummaryPack.routeGeometryMode, 'omitted');
  assert.strictEqual(
    getDiscoverableTrailPacks(
      [cachedSummaryPack],
      cachedSummaryPack.centerCoordinate,
      50,
    ).length,
    1,
    'Explicitly approved summary metadata must remain discoverable despite deferred geometry.',
  );
  const cachedSummaryRoute = routeCatalogSummaryToDeferredOpportunity(catalogSummary(), {
    publicRecommendation: true,
    sourceState: 'cached',
  });
  assert(cachedSummaryRoute);
  assert.strictEqual(cachedSummaryRoute.routeMetadata.routeCatalogSourceState, 'cached');
  assert.strictEqual(classifyExploreRouteAvailability(cachedSummaryRoute).discoverability.eligible, true);
  assert.strictEqual(classifyExploreRouteAvailability(cachedSummaryRoute).tripBuilder.eligible, true);

  const fallbackPack = routeCatalogSummaryToDeferredTrailPack(catalogSummary('fallback-summary'), {
    publicRecommendation: false,
    sourceState: 'offline',
  });
  assert(fallbackPack);
  assert.strictEqual(
    getDiscoverableTrailPacks([fallbackPack], fallbackPack.centerCoordinate, 50).length,
    0,
    'A cached fallback summary must not bypass the public provider-influence gate.',
  );
  const previewPack = routeCatalogSummaryToDeferredTrailPack(
    catalogSummary('preview-summary', { sourceType: 'preview' }),
    { publicRecommendation: true, sourceState: 'live' },
  );
  assert(previewPack);
  assert.strictEqual(previewPack.catalogVerification.publicRecommendation, false);

  const bboxOnlyRoute = routeCatalogSummaryToDeferredOpportunity(
    catalogSummary('bbox-only', { trailheadCoordinate: null }),
    { publicRecommendation: true, sourceState: 'live' },
  );
  assert(bboxOnlyRoute, 'A bbox can anchor discovery presentation without becoming a trailhead.');
  assert.strictEqual(classifyExploreRouteAvailability(bboxOnlyRoute).discoverability.eligible, true);
  assert.strictEqual(getExploreTripBuilderEligibility(bboxOnlyRoute).eligible, false);
  assert.strictEqual(getExploreTripBuilderEligibility(bboxOnlyRoute).code, 'missing_route_endpoint');
  assert.strictEqual(
    routeCatalogSummaryToDeferredOpportunity(
      catalogSummary('missing-anchor', { bbox: null, trailheadCoordinate: null }),
      { publicRecommendation: true },
    ),
    null,
    'Unknown location must remain unknown instead of falling back to the default map coordinate.',
  );

  const availability = classifyExploreRouteAvailability(summary);
  assert.strictEqual(providerCalls, 0, 'Classifying/rendering a summary must not request route detail.');
  assert.strictEqual(availability.discoverability.eligible, true);
  assert.strictEqual(availability.tripBuilder.eligible, true);
  assert.strictEqual(availability.guidance.eligible, false);
  assert.strictEqual(availability.detailState, 'deferred');

  const success = await resolveExploreTripBuilderRouteDetail(summary, {
    fetchDetail: async (routeId, options) => {
      providerCalls += 1;
      assert.strictEqual(routeId, 'summary-route');
      assert.strictEqual(options.sourceVersion, '2026-07-16T00:00:00.000Z');
      return detailTrailPack();
    },
  });
  assert.strictEqual(providerCalls, 1, 'Selecting the summary should issue one detail request in Trip Builder.');
  assert.strictEqual(success.status, 'ready');
  assert.strictEqual(success.route.id, summary.id, 'Detail promotion must preserve stable selected identity.');
  assert.strictEqual(success.route.routeGeometry.type, 'LineString');
  assert.strictEqual(
    getResolvedExploreTripBuilderRouteDetail(summaryRoute('different-summary'), success.route),
    null,
    'A ready detail from an older selection must not enable a newer deferred route.',
  );
  assert.strictEqual(
    getResolvedExploreTripBuilderRouteDetail(summary, success.route).id,
    summary.id,
    'Matching ready detail should resolve the currently selected summary.',
  );

  const failure = await resolveExploreTripBuilderRouteDetail(summary, {
    fetchDetail: async () => {
      providerCalls += 1;
      throw new Error('Provider unavailable');
    },
  });
  assert.strictEqual(failure.status, 'error');
  assert.strictEqual(failure.route, summary, 'Provider failure must preserve the selected summary.');
  assert.strictEqual(failure.retryEligible, true);
  assert.strictEqual(failure.safeErrorCode, 'ROUTE_CATALOG_DETAIL_UNAVAILABLE');

  const malformed = await resolveExploreTripBuilderRouteDetail(summary, {
    fetchDetail: async () => ({ ...detailTrailPack(), routeGeometry: undefined }),
  });
  assert.strictEqual(malformed.status, 'error');
  assert.strictEqual(malformed.safeErrorCode, 'ROUTE_CATALOG_DETAIL_INVALID_GEOMETRY');
  assert.strictEqual(malformed.route, summary, 'Malformed detail must not replace last-good summary metadata.');

  const blockedDetail = await resolveExploreTripBuilderRouteDetail(summary, {
    fetchDetail: async () => ({
      ...detailTrailPack(),
      catalogVerification: {
        ...detailTrailPack().catalogVerification,
        publicRecommendation: false,
        blockers: ['Route is not approved for public recommendation.'],
      },
    }),
  });
  assert.strictEqual(blockedDetail.status, 'error');
  assert.strictEqual(blockedDetail.safeErrorCode, 'ROUTE_CATALOG_DETAIL_REJECTED');
  assert.strictEqual(blockedDetail.retryEligible, false);
  assert.strictEqual(blockedDetail.route, summary);

  const suppliedMalformedSummary = {
    ...summaryRoute('supplied-malformed'),
    routeGeometry: { type: 'LineString', coordinates: [['invalid', 'geometry']] },
  };
  assert.strictEqual(isExploreRouteCatalogDetailDeferred(suppliedMalformedSummary), false);
  assert.strictEqual(classifyExploreRouteAvailability(suppliedMalformedSummary).detailState, 'invalid');
  assert(
    classifyExploreRouteAvailability(suppliedMalformedSummary).guidance.exclusionCodes.includes('invalid_geometry'),
  );
  const staleModeWithValidGeometry = {
    ...summaryRoute('stale-mode-valid-geometry'),
    routeGeometry: detailTrailPack().routeGeometry,
  };
  assert.strictEqual(
    isExploreRouteCatalogDetailDeferred(staleModeWithValidGeometry),
    false,
    'Supplied valid geometry must not refetch forever because stale metadata still says omitted.',
  );

  const controller = new AbortController();
  const cancelledPromise = resolveExploreTripBuilderRouteDetail(summary, {
    signal: controller.signal,
    fetchDetail: async () => new Promise((resolve) => {
      setImmediate(() => resolve(detailTrailPack()));
    }),
  });
  controller.abort('unmount');
  const cancelled = await cancelledPromise;
  assert.strictEqual(cancelled.status, 'cancelled');
  assert.strictEqual(cancelled.route, summary);

  console.log('Explore summary-first selected detail behavior checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

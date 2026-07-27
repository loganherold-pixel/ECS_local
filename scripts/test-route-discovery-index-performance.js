const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;
require.extensions['.tsx'] = compileTypescript;

const modulePath = path.join(root, 'lib', 'explore', 'routeDiscoveryIndex.ts');
assert(fs.existsSync(modulePath), 'Route discovery index service should exist.');
const discoverSource = fs.readFileSync(path.join(root, 'app', '(tabs)', 'discover.tsx'), 'utf8');
const trailPackCardSource = fs.readFileSync(path.join(root, 'components', 'discover', 'TrailPackCard.tsx'), 'utf8');

const {
  buildRouteDiscoveryIndex,
  createRouteDiscoveryCache,
  createRouteDiscoveryCacheKey,
  createRouteDiscoveryImageCache,
  normalizeRouteDiscoveryCoordinateBucket,
  getNextRouteDiscoveryBatch,
  planRouteDiscoveryImagePrefetch,
  queryRouteDiscoveryIndex,
  queryTrailPackDiscoveryIndexCached,
  revalidateTrailPackDiscoveryIndexCache,
} = require(modulePath);

const userNearTahoe = { latitude: 38.92, longitude: -120.78 };
const nowIso = '2026-06-22T12:00:00.000Z';

function trailPack(overrides = {}) {
  return {
    id: 'route-a',
    name: 'Nearby Route A',
    description: 'Indexed route fixture',
    source: 'ecs_validated',
    routeType: 'point_to_point',
    centerCoordinate: { latitude: userNearTahoe.latitude, longitude: userNearTahoe.longitude },
    routeGeometryMode: 'full',
    distanceMiles: 18,
    estimatedDurationMinutes: 240,
    difficulty: 'moderate',
    confidenceScore: 88,
    confidenceReasons: ['Official access verified'],
    positiveFeedbackCount: 8,
    completionCount: 3,
    reviewStatus: 'approved',
    dataState: 'live',
    tags: ['Tahoe National Forest', 'day trip'],
    routeIntelligence: {
      tripType: 'day_trip',
      aliases: ['nearby route a'],
      bounds: {
        minLatitude: 38.9,
        minLongitude: -120.82,
        maxLatitude: 38.96,
        maxLongitude: -120.7,
      },
      trailheadCoordinate: { latitude: 38.91, longitude: -120.8 },
    },
    catalogVerification: {
      status: 'normal',
      sourceLabel: 'Official access verified',
      publicRecommendation: true,
      confidenceScore: 88,
      warnings: [],
      blockers: [],
      dataUsed: [],
      lastEvaluatedAt: nowIso,
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
    createdAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

const obscureRoutes = Array.from({ length: 36 }, (_, index) =>
  trailPack({
    id: `obscure-${index}`,
    name: `Lesser Known Tahoe Connector ${index}`,
    confidenceScore: 82 + (index % 8),
    distanceMiles: 12 + index,
    estimatedDurationMinutes: 180 + index * 5,
    centerCoordinate: {
      latitude: userNearTahoe.latitude + (index % 5) * 0.01,
      longitude: userNearTahoe.longitude + (index % 6) * 0.01,
    },
    routeIntelligence: {
      tripType: 'day_trip',
      bounds: {
        minLatitude: userNearTahoe.latitude - 0.01,
        minLongitude: userNearTahoe.longitude - 0.01,
        maxLatitude: userNearTahoe.latitude + 0.08,
        maxLongitude: userNearTahoe.longitude + 0.08,
      },
      aliases: [`lesser known ${index}`],
    },
  }),
);

const rubiconTrail = trailPack({
  id: 'rubicon-trail',
  name: 'Rubicon Trail',
  confidenceScore: 91,
  featuredRouteScore: 100,
  distanceMiles: 21,
  estimatedDurationMinutes: 780,
  centerCoordinate: { latitude: 39.02, longitude: -120.23 },
  tags: ['Tahoe National Forest', 'Eldorado National Forest', 'Rubicon', 'featured', 'day trip'],
  routeIntelligence: {
    tripType: 'day_trip',
    aliases: ['rubicon', 'rubicon trail', 'the rubicon'],
    bounds: {
      minLatitude: 39.0,
      minLongitude: -120.32,
      maxLatitude: 39.06,
      maxLongitude: -120.1,
    },
    trailheadCoordinate: { latitude: 39.006, longitude: -120.315 },
    featured: true,
  },
});

const trailheadOnly = trailPack({
  id: 'trailhead-only',
  name: 'Trailhead Only Route',
  routeGeometryMode: 'omitted',
  distanceMiles: 6,
  routeIntelligence: {
    tripType: 'day_trip',
    trailheadCoordinate: { latitude: 38.93, longitude: -120.77 },
  },
  catalogVerification: {
    ...trailPack().catalogVerification,
    activeGuidance: {
      ...trailPack().catalogVerification.activeGuidance,
      status: 'unavailable',
      unavailableReason: 'Route geometry is unavailable',
    },
  },
});

let geometryTouched = 0;
const geometryTrap = trailPack({
  id: 'geometry-trap',
  name: 'Indexed Without Geometry Read',
  routeIntelligence: {
    tripType: 'day_trip',
    bounds: {
      minLatitude: 38.91,
      minLongitude: -120.8,
      maxLatitude: 38.94,
      maxLongitude: -120.75,
    },
  },
});
Object.defineProperty(geometryTrap, 'routeGeometry', {
  get() {
    geometryTouched += 1;
    throw new Error('Full geometry should not be read when index metadata exists.');
  },
});

const index = buildRouteDiscoveryIndex(
  [geometryTrap, trailheadOnly, ...obscureRoutes, rubiconTrail],
  { catalogVersionHash: 'catalog-v1', builtAt: nowIso },
);

assert.strictEqual(geometryTouched, 0, 'Index build should prefer metadata bounds over full geometry.');
assert.strictEqual(index.entries.length, 39);
assert(index.entries.every((entry) => entry.routeId && entry.title));

const rubiconEntry = index.entries.find((entry) => entry.routeId === 'rubicon-trail');
assert(rubiconEntry, 'Rubicon Trail should be indexed.');
assert(rubiconEntry.aliases.includes('rubicon trail'));
assert.strictEqual(rubiconEntry.guidanceReady, true);
assert.strictEqual(rubiconEntry.geometryStatus, 'full');
assert(rubiconEntry.bounds, 'Rubicon should have bounds in the lightweight index.');
assert(rubiconEntry.thumbnail, 'Index should carry thumbnail/image metadata.');

const predicateTrapIndex = buildRouteDiscoveryIndex([
  ...Array.from({ length: 25 }, (_, index) => trailPack({
    id: `high-ranked-official-${String(index).padStart(2, '0')}`,
    name: `High Ranked Official Route ${index}`,
    source: 'ecs_validated',
    featuredRouteScore: 200 - index,
    confidenceScore: 95,
  })),
  trailPack({
    id: 'needle-community-route',
    name: 'Needle Canyon Community Route',
    source: 'community_reviewed',
    featuredRouteScore: 0,
    confidenceScore: 60,
    tags: ['Needle Canyon', 'community route'],
  }),
  trailPack({
    id: 'imported-loop-route',
    name: 'Imported Loop Route',
    source: 'imported_gpx',
    routeType: 'loop',
    featuredRouteScore: 0,
    confidenceScore: 55,
  }),
], { catalogVersionHash: 'catalog-query-predicates', builtAt: nowIso });
const predicateBaseQuery = {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
};
const predicateUnfiltered = queryRouteDiscoveryIndex(predicateTrapIndex, predicateBaseQuery);
assert.strictEqual(predicateUnfiltered.allItems.length, 20);
assert(
  !predicateUnfiltered.allItems.some((entry) => entry.routeId === 'needle-community-route'),
  'The low-ranked text/category target should sit outside the unfiltered top 20.',
);
assert.deepStrictEqual(
  queryRouteDiscoveryIndex(predicateTrapIndex, {
    ...predicateBaseQuery,
    searchText: 'needle canyon',
  }).allItems.map((entry) => entry.routeId),
  ['needle-community-route'],
  'Text filtering must run before ranking and the final top-20 slice.',
);
assert.deepStrictEqual(
  queryRouteDiscoveryIndex(predicateTrapIndex, {
    ...predicateBaseQuery,
    routeCategory: 'community',
  }).allItems.map((entry) => entry.routeId),
  ['needle-community-route'],
  'Route-category filtering must run before ranking and the final top-20 slice.',
);
assert.deepStrictEqual(
  queryRouteDiscoveryIndex(predicateTrapIndex, {
    ...predicateBaseQuery,
    sourceFilter: 'imported_gpx',
  }).allItems.map((entry) => entry.routeId),
  ['imported-loop-route'],
  'Exact source filtering must run before ranking and the final top-20 slice.',
);
assert.deepStrictEqual(
  queryRouteDiscoveryIndex(predicateTrapIndex, {
    ...predicateBaseQuery,
    sourceFilter: 'imported',
    routeCategory: 'loop',
  }).allItems.map((entry) => entry.routeId),
  ['imported-loop-route'],
  'Source-family and route-type category filters should compose before selection.',
);

const cacheKey = createRouteDiscoveryCacheKey(index, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
});
assert(cacheKey.includes('catalog-v1'));
assert(cacheKey.includes('100'));
assert.notStrictEqual(
  createRouteDiscoveryCacheKey(index, {
    coordinate: userNearTahoe,
    radiusMiles: 100,
    refinement: 'dayTrip',
    sourceFilter: 'all',
    searchText: '',
  }, { access: 'anonymous' }),
  createRouteDiscoveryCacheKey(index, {
    coordinate: userNearTahoe,
    radiusMiles: 100,
    refinement: 'dayTrip',
    sourceFilter: 'all',
    searchText: '',
  }, { access: 'authenticated' }),
  'Cache identity must separate access contexts that can change route visibility.',
);
assert.notStrictEqual(
  createRouteDiscoveryCacheKey(index, {
    coordinate: userNearTahoe,
    radiusMiles: 100,
    refinement: 'dayTrip',
    routeCategory: 'official',
  }),
  createRouteDiscoveryCacheKey(index, {
    coordinate: userNearTahoe,
    radiusMiles: 100,
    refinement: 'dayTrip',
    routeCategory: 'community',
  }),
  'Category and refinement context must participate in route cache identity.',
);

const jitterBucketA = normalizeRouteDiscoveryCoordinateBucket({
  latitude: 38.921,
  longitude: -120.779,
});
const jitterBucketB = normalizeRouteDiscoveryCoordinateBucket({
  latitude: 38.944,
  longitude: -120.752,
});
assert.strictEqual(
  jitterBucketA.bucketKey,
  jitterBucketB.bucketKey,
  'Nearby GPS jitter should remain in the same Explore discovery bucket.',
);
assert.deepStrictEqual(
  jitterBucketA.coordinate,
  { latitude: 38.9, longitude: -120.8 },
  'Explore discovery buckets should be coarse enough to avoid refresh churn.',
);
const movedBucket = normalizeRouteDiscoveryCoordinateBucket({
  latitude: 38.981,
  longitude: -120.752,
});
assert.notStrictEqual(
  movedBucket.bucketKey,
  jitterBucketA.bucketKey,
  'Meaningful location movement should create a new discovery bucket.',
);
assert.strictEqual(
  createRouteDiscoveryCacheKey(index, {
    coordinate: jitterBucketA.coordinate,
    radiusMiles: 100,
    refinement: 'dayTrip',
  }),
  createRouteDiscoveryCacheKey(index, {
    coordinate: jitterBucketB.coordinate,
    radiusMiles: 100,
    refinement: 'dayTrip',
  }),
  'Stable Explore discovery buckets should reuse cached nearby results across jitter.',
);

const uncached = queryRouteDiscoveryIndex(index, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
  firstBatchSize: 12,
  batchSize: 10,
});
assert.strictEqual(uncached.cacheStatus, 'uncached');
assert.strictEqual(uncached.items.length, 12, 'Fresh discovery should return a first batch only.');
assert(uncached.totalEligibleCount > 20, 'Discovery should retain the uncapped eligible count for truthful messaging.');
assert.strictEqual(uncached.allItems.length, 20, 'A route-discovery result set must contain at most 20 unique routes.');
assert(uncached.allItems.some((entry) => entry.routeId === 'rubicon-trail'), 'Rubicon should match a 100-mile Tahoe query.');
assert(
  uncached.items.slice(0, 5).some((entry) => entry.routeId === 'rubicon-trail'),
  'Rubicon should be prioritized when featured and in range.',
);
assert(
  uncached.allItems.some((entry) => /^obscure-/.test(entry.routeId)),
  'Lesser-known qualifying routes should remain discoverable.',
);

const secondBatch = getNextRouteDiscoveryBatch(uncached);
assert.strictEqual(secondBatch.items.length, 8, 'Only the remainder of the same capped 20-route set may be returned.');
assert.strictEqual(secondBatch.offset, 12);
assert.strictEqual(secondBatch.nextCursor, null, 'No continuation may exist after the 20th accepted route.');
assert.notDeepStrictEqual(
  secondBatch.items.map((entry) => entry.routeId),
  uncached.items.map((entry) => entry.routeId),
  'Second batch should contain additional routes, not duplicate the first batch.',
);
assert.strictEqual(
  getNextRouteDiscoveryBatch({ ...uncached, nextCursor: 20 }).items.length,
  0,
  'A delayed continuation positioned after the cap cannot append a 21st route.',
);

const normalizedInvalidLimits = queryRouteDiscoveryIndex(index, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
  resultLimit: -1,
  firstBatchSize: -5,
  batchSize: Number.NaN,
});
assert.strictEqual(normalizedInvalidLimits.items.length, 20, 'Invalid route limits must use the safe default of 20.');
const oversizedLimit = queryRouteDiscoveryIndex(index, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
  resultLimit: 51,
  firstBatchSize: 51,
});
assert.strictEqual(oversizedLimit.items.length, 20, 'Requested route limits above 20 must clamp to 20.');

const duplicateIndex = buildRouteDiscoveryIndex(
  [rubiconTrail, ...obscureRoutes, { ...rubiconTrail, name: 'Duplicate Rubicon' }],
  { catalogVersionHash: 'catalog-duplicates', builtAt: nowIso },
);
const deduplicated = queryRouteDiscoveryIndex(duplicateIndex, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
});
assert.strictEqual(
  deduplicated.allItems.filter((entry) => entry.routeId === 'rubicon-trail').length,
  1,
  'Duplicate route IDs must not consume more than one result position.',
);

const discoveryCache = createRouteDiscoveryCache({ ttlMs: 60_000, staleMs: 120_000 });
const boundedCache = createRouteDiscoveryCache({ maxEntries: 3 });
for (let index = 0; index < 5; index += 1) {
  boundedCache.set(`query-${index}`, { id: index }, 1_000 + index);
}
assert.strictEqual(boundedCache.entries.size, 3, 'Discovery cache should retain only its bounded LRU window.');
assert.strictEqual(boundedCache.get('query-0', 1_010).status, 'miss');
assert.strictEqual(boundedCache.get('query-4', 1_010).status, 'hit');
const firstCached = queryTrailPackDiscoveryIndexCached(index, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
  firstBatchSize: 12,
  batchSize: 10,
}, {
  cache: discoveryCache,
  nowMs: 1_000,
});
assert.strictEqual(firstCached.cacheStatus, 'miss');
assert.strictEqual(firstCached.trailPacks.length, 12);
assert(firstCached.allTrailPacks.length > firstCached.trailPacks.length, 'Cached discovery should retain the full eligible set for incremental population.');
assert.strictEqual(firstCached.allTrailPacks.length, 20, 'Cached route arrays must retain no more than the capped top 20.');
assert(firstCached.totalEligibleCount > firstCached.allTrailPacks.length);

const cacheHit = queryTrailPackDiscoveryIndexCached(index, {
  coordinate: { latitude: 38.921, longitude: -120.779 },
  radiusMiles: 100,
  refinement: 'dayTrip',
  firstBatchSize: 12,
  batchSize: 10,
}, {
  cache: discoveryCache,
  nowMs: 2_000,
});
assert.strictEqual(cacheHit.cacheStatus, 'hit');
assert.deepStrictEqual(
  cacheHit.trailPacks.map((pack) => pack.id),
  firstCached.trailPacks.map((pack) => pack.id),
  'Rounded location bucket should reuse cached nearby discovery.',
);

const oversizedLegacyCache = createRouteDiscoveryCache({ ttlMs: 60_000, staleMs: 120_000 });
const legacyCacheSeed = queryTrailPackDiscoveryIndexCached(index, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
}, {
  cache: oversizedLegacyCache,
  nowMs: 1_000,
});
const legacyExtraEntries = index.entries
  .filter((entry) => !legacyCacheSeed.allItems.some((selected) => selected.routeId === entry.routeId))
  .slice(0, 5);
const legacyExtraPacks = legacyExtraEntries
  .map((entry) => index.routeById.get(entry.routeId))
  .filter(Boolean);
oversizedLegacyCache.set(legacyCacheSeed.cacheKey, {
  ...legacyCacheSeed,
  items: [...legacyCacheSeed.items, ...legacyExtraEntries],
  allItems: [...legacyCacheSeed.allItems, ...legacyExtraEntries],
  trailPacks: [...legacyCacheSeed.trailPacks, ...legacyExtraPacks],
  allTrailPacks: [...legacyCacheSeed.allTrailPacks, ...legacyExtraPacks],
  nextCursor: 20,
}, 1_100);
const sanitizedLegacyCacheHit = queryTrailPackDiscoveryIndexCached(index, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
}, {
  cache: oversizedLegacyCache,
  nowMs: 1_200,
});
assert.strictEqual(sanitizedLegacyCacheHit.allItems.length, 20, 'An oversized cached snapshot must be clamped on read.');
assert.strictEqual(sanitizedLegacyCacheHit.allTrailPacks.length, 20, 'Cached application route arrays cannot retain a 21st route.');
assert.strictEqual(sanitizedLegacyCacheHit.nextCursor, null, 'An oversized legacy cache cannot restore continuation beyond 20.');

const staleResult = queryTrailPackDiscoveryIndexCached(index, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
  firstBatchSize: 12,
  batchSize: 10,
}, {
  cache: discoveryCache,
  nowMs: 130_000,
});
assert.strictEqual(staleResult.cacheStatus, 'stale');
assert.strictEqual(staleResult.shouldRevalidate, true);

const newerIndex = buildRouteDiscoveryIndex(
  [
    trailPack({
      id: 'new-high-confidence-route',
      name: 'New High Confidence Nearby Route',
      confidenceScore: 99,
      featuredRouteScore: 80,
      routeIntelligence: {
        tripType: 'day_trip',
        bounds: {
          minLatitude: 38.91,
          minLongitude: -120.8,
          maxLatitude: 38.93,
          maxLongitude: -120.77,
        },
      },
    }),
    geometryTrap,
    trailheadOnly,
    ...obscureRoutes,
    rubiconTrail,
  ],
  { catalogVersionHash: 'catalog-v1', builtAt: nowIso },
);
const refreshed = revalidateTrailPackDiscoveryIndexCache(newerIndex, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
  firstBatchSize: 12,
  batchSize: 10,
}, {
  cache: discoveryCache,
  nowMs: 130_100,
});
assert.strictEqual(refreshed.updated, true);
assert(
  refreshed.result.trailPacks.some((pack) => pack.id === 'new-high-confidence-route'),
  'Revalidation should update cache when refreshed indexed results differ.',
);

const imageCache = createRouteDiscoveryImageCache();
imageCache.markLoaded(rubiconEntry.thumbnail.uri);
const prefetchPlan = planRouteDiscoveryImagePrefetch(uncached.allItems, {
  imageCache,
  visibleCount: uncached.items.length,
  prefetchCount: 4,
});
assert(prefetchPlan.placeholderVisible, 'Card image placeholders should be explicit.');
assert.strictEqual(prefetchPlan.textAndMetadataFirst, true);
assert(prefetchPlan.prefetchUris.length <= 4, 'Image prefetch should only cover a small next batch.');
assert(!prefetchPlan.prefetchUris.includes(rubiconEntry.thumbnail.uri), 'Already cached visible images should not be prefetched again.');

const fallbackImageEntry = buildRouteDiscoveryIndex([
  trailPack({
    id: 'no-image-route',
    name: 'No Image Metadata Route',
    tags: ['Mendocino National Forest'],
    routeIntelligence: {
      tripType: 'day_trip',
      bounds: {
        minLatitude: 38.91,
        minLongitude: -120.8,
        maxLatitude: 38.94,
        maxLongitude: -120.75,
      },
    },
  }),
], { catalogVersionHash: 'fallback-image' }).entries[0];
assert(fallbackImageEntry.thumbnail?.uri, 'Routes without explicit images should receive a thumbnail fallback.');
assert.notStrictEqual(fallbackImageEntry.thumbnail.state, 'suppressed_mismatch');

[
  'buildRouteDiscoveryIndex',
  'queryTrailPackDiscoveryIndexCached',
  'revalidateTrailPackDiscoveryIndexCache',
  'normalizeRouteDiscoveryCoordinateBucket',
  'stableRouteCatalogSearchCoordinate',
  'showTrailPackBlockingLoading',
  'routeDiscoveryVisibleCount',
  'EXPLORE_ROUTE_DISCOVERY_FIRST_BATCH_SIZE',
].forEach((needle) => {
  assert(discoverSource.includes(needle), `Explore should use indexed route discovery wiring: ${needle}.`);
});
[
  'RouteCatalogSummaryCard',
  'paginateRouteCatalogSummaries',
  'visibleRouteCatalogSummaries',
  'handlePrepareRouteCatalogSummaryOffline',
  'onPrepareOffline={handlePrepareRouteCatalogSummaryOffline}',
  'void handlePrepareOfflineFromRoute(routeForHandoff)',
  "mode: 'trail_download'",
  'includePreviewGeometry: false',
].forEach((needle) => {
  assert(discoverSource.includes(needle), `Explore should use summary-first Trail Pack wiring: ${needle}.`);
});
assert(
  !discoverSource.includes('handlePreviewRouteCatalogSummary') &&
    !discoverSource.includes('handleStartRouteCatalogSummaryGuidance') &&
    !discoverSource.includes('sourceVersion: summary.updatedAt'),
  'Ordinary Explore summary presentation should not fetch route detail or expose geometry-dependent actions.',
);
assert(
  !discoverSource.includes('planRouteDiscoveryImagePrefetch'),
  'Explore Trail Pack summaries should not run image prefetch planning during initial render.',
);
assert(
  !discoverSource.includes('Number(routeCatalogSearchCoordinate.latitude).toFixed(4)'),
  'Explore performance/search keys should use the stable route discovery bucket, not raw GPS precision.',
);
assert(
  !discoverSource.includes('liveTrailPackCatalogSnapshot.lastLoadedAt,\n          liveTrailPackCatalogSnapshot.trailPacks.length'),
  'Explore route discovery index versioning should not include refresh timestamps that reset visible batches for identical route data.',
);
assert(
  !discoverSource.includes('getDiscoverableTrailPacks,'),
  'Explore should not route nearby Trail Pack discovery through the full geometry-heavy helper import.',
);
assert(trailPackCardSource.includes('thumbnailPlaceholder'), 'Trail Pack cards should include a non-blocking thumbnail placeholder.');
assert(trailPackCardSource.includes('onLoadStart'), 'Trail Pack cards should measure image load without blocking metadata render.');

console.log('Route discovery index performance checks passed.');

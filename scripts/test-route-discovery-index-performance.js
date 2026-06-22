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

const cacheKey = createRouteDiscoveryCacheKey(index, {
  coordinate: userNearTahoe,
  radiusMiles: 100,
  refinement: 'dayTrip',
});
assert(cacheKey.includes('catalog-v1'));
assert(cacheKey.includes('100'));

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
assert(uncached.totalEligibleCount > 26, 'Discovery should not silently stop at an early cap.');
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
assert.strictEqual(secondBatch.items.length, 10);
assert.strictEqual(secondBatch.offset, 12);
assert.notDeepStrictEqual(
  secondBatch.items.map((entry) => entry.routeId),
  uncached.items.map((entry) => entry.routeId),
  'Second batch should contain additional routes, not duplicate the first batch.',
);

const discoveryCache = createRouteDiscoveryCache({ ttlMs: 60_000, staleMs: 120_000 });
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
assert.strictEqual(firstCached.allTrailPacks.length, firstCached.totalEligibleCount);

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
  'planRouteDiscoveryImagePrefetch',
  'normalizeRouteDiscoveryCoordinateBucket',
  'stableRouteCatalogSearchCoordinate',
  'showTrailPackBlockingLoading',
  'routeDiscoveryVisibleCount',
  'EXPLORE_ROUTE_DISCOVERY_FIRST_BATCH_SIZE',
].forEach((needle) => {
  assert(discoverSource.includes(needle), `Explore should use indexed route discovery wiring: ${needle}.`);
});
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

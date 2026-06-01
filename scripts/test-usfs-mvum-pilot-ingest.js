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
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
}

require.extensions['.ts'] = compileTypescript;

const {
  USFS_MVUM_LAYERS,
  USFS_MVUM_PILOT_FORESTS,
  aggregateUsfsMvumRouteFeatures,
  arcGisFeatureToVerifiedRouteUpsert,
  buildUsfsMvumWhereClause,
  normalizeUsfsMvumFeatureCollection,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogUsfsMvum.ts'));

assert.deepStrictEqual(
  USFS_MVUM_PILOT_FORESTS.map((forest) => forest.slug),
  ['tahoe-national-forest', 'mendocino-national-forest'],
  'Tahoe and Mendocino should be the first MVUM pilot forests',
);
assert(
  USFS_MVUM_LAYERS.some((layer) => layer.kind === 'road' && layer.url.includes('Motor_Vehicle_Use_Map_Roads')) &&
    USFS_MVUM_LAYERS.some((layer) => layer.kind === 'trail' && layer.url.includes('Motor_Vehicle_Use_Maps_Trails')),
  'Importer should use the official Forest Service MVUM road and trail FeatureServer layers',
);

const where = buildUsfsMvumWhereClause(USFS_MVUM_PILOT_FORESTS, { minMiles: 1 });
assert(where.includes("FORESTNAME in ('Tahoe National Forest','Mendocino National Forest')"));
assert(where.includes('GIS_MILES >= 1'));
assert(where.includes("HIGHCLEARA = 'open'") && where.includes("FOURWD_GT5 = 'open'"));

const tahoeFeature = {
  attributes: {
    FID: 101,
    RTE_CN: '12345',
    ID: '0035',
    NAME: 'CAL IDA SCALES',
    GIS_MILES: 1.408,
    HIGHCLEARA: 'open',
    FOURWD_GT5: 'open',
    PASSENGERV: 'open',
    SEASONAL: ' ',
    FORESTNAME: 'Tahoe National Forest',
    DISTRICTNA: 'Yuba River Ranger District',
    ROUTESTATU: 'EX - EXISTING',
  },
  geometry: {
    paths: [
      [
        [-120.91234, 39.41234],
        [-120.90234, 39.42234],
        [-120.89234, 39.43234],
      ],
    ],
  },
};

const tahoeRoute = arcGisFeatureToVerifiedRouteUpsert(tahoeFeature, {
  forest: USFS_MVUM_PILOT_FORESTS[0],
  layer: USFS_MVUM_LAYERS.find((layer) => layer.kind === 'road'),
  sourceId: '00000000-0000-0000-0000-000000000001',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 1,
});

assert(tahoeRoute, 'A Tahoe official MVUM feature with geometry should produce a route upsert');
assert.strictEqual(tahoeRoute.verifiedRoute.public_id, 'usfs-mvum-tahoe-national-forest-road-0035-cal-ida-scales-feature-101');
assert.strictEqual(tahoeRoute.verifiedRoute.name, 'FR 0035 Cal Ida Scales');
assert.strictEqual(tahoeRoute.verifiedRoute.review_status, 'approved');
assert.strictEqual(tahoeRoute.verifiedRoute.recommendation_status, 'recommendable');
assert.strictEqual(tahoeRoute.verifiedRoute.verification_status, 'official_verified');
assert.strictEqual(tahoeRoute.verifiedRoute.official_access_coverage_pct, 100);
assert.strictEqual(tahoeRoute.verifiedRoute.unknown_access_coverage_pct, 0);
assert.deepStrictEqual(tahoeRoute.verifiedRoute.vehicle_fit, ['highway_legal_4x4', 'full_size_4x4']);
assert.strictEqual(tahoeRoute.verifiedRoute.route_geometry.type, 'LineString');
assert(
  Number.isFinite(tahoeRoute.verifiedRoute.remoteness_score),
  'MVUM segment upserts should populate schema-backed remoteness_score for catalog filtering',
);
assert.strictEqual(
  tahoeRoute.verifiedRoute.campability_score,
  null,
  'MVUM segment upserts should keep campability unknown until reviewed camp endpoint data exists',
);
assert(
  tahoeRoute.verifiedRoute.minimum_fuel_range_miles >= tahoeRoute.verifiedRoute.distance_miles,
  'MVUM segment upserts should populate a conservative minimum fuel range requirement',
);
assert(
  tahoeRoute.verifiedRoute.minimum_water_capacity_gallons >= 1,
  'MVUM segment upserts should populate a conservative minimum water capacity requirement',
);
assert.strictEqual(
  tahoeRoute.verifiedRoute.route_intelligence.resourceMarginBasis,
  'estimated_from_mvum_distance_and_duration',
  'MVUM segment upserts should label estimated fuel/water margins instead of implying live resource certainty',
);
assert(tahoeRoute.verifiedRoute.confidence_reasons.some((reason) => /USFS MVUM/i.test(reason)));
assert(tahoeRoute.verifiedRoute.warning_reasons.some((warning) => /legal baseline/i.test(warning)));
assert.strictEqual(tahoeRoute.verifiedRouteSource.route_source_id, '00000000-0000-0000-0000-000000000001');
assert.strictEqual(tahoeRoute.rawSourceFeature.provider_feature_id, 'road:0035:101');

const tahoeContinuationFeature = {
  attributes: {
    FID: 102,
    RTE_CN: '12345',
    ID: '0035',
    NAME: 'CAL IDA SCALES',
    GIS_MILES: 2.5,
    HIGHCLEARA: 'open',
    FOURWD_GT5: 'open',
    PASSENGERV: 'open',
    FORESTNAME: 'Tahoe National Forest',
    DISTRICTNA: 'Yuba River Ranger District',
    ROUTESTATU: 'EX - EXISTING',
  },
  geometry: {
    paths: [
      [
        [-120.89234, 39.43234],
        [-120.88234, 39.44234],
        [-120.87234, 39.45234],
      ],
    ],
  },
};

const tahoeDifferentRouteFeature = {
  attributes: {
    FID: 103,
    RTE_CN: '67890',
    ID: '0040',
    NAME: 'SECOND ROUTE',
    GIS_MILES: 1.25,
    HIGHCLEARA: 'open',
    FOURWD_GT5: 'open',
    FORESTNAME: 'Tahoe National Forest',
    DISTRICTNA: 'Yuba River Ranger District',
    ROUTESTATU: 'EX - EXISTING',
  },
  geometry: {
    paths: [
      [
        [-120.78234, 39.35234],
        [-120.77234, 39.36234],
      ],
    ],
  },
};

const tahoeAggregates = aggregateUsfsMvumRouteFeatures(
  [tahoeFeature, tahoeContinuationFeature, tahoeDifferentRouteFeature],
  {
    forest: USFS_MVUM_PILOT_FORESTS[0],
    layer: USFS_MVUM_LAYERS.find((layer) => layer.kind === 'road'),
    sourceId: '00000000-0000-0000-0000-000000000001',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  },
);
assert.strictEqual(tahoeAggregates.length, 2, 'Aggregator should publish one record per named/numbered MVUM route identity');
const calIdaAggregate = tahoeAggregates.find(
  (aggregate) => aggregate.verifiedRoute.public_id === 'usfs-mvum-tahoe-national-forest-road-0035-cal-ida-scales',
);
assert(calIdaAggregate, 'Aggregator should publish a stable named route public_id without feature suffix');
assert.strictEqual(calIdaAggregate.verifiedRoute.name, 'FR 0035 Cal Ida Scales');
assert.strictEqual(calIdaAggregate.verifiedRoute.recommendation_status, 'recommendable');
assert.strictEqual(calIdaAggregate.verifiedRoute.verification_status, 'official_verified');
assert.strictEqual(calIdaAggregate.verifiedRoute.route_geometry.type, 'MultiLineString');
assert.strictEqual(calIdaAggregate.verifiedRoute.route_geometry.coordinates.length, 2);
assert.strictEqual(calIdaAggregate.verifiedRoute.distance_miles, 3.908);
assert(
  Number.isFinite(calIdaAggregate.verifiedRoute.remoteness_score),
  'Aggregate MVUM routes should carry schema-backed remoteness_score',
);
assert.strictEqual(
  calIdaAggregate.verifiedRoute.campability_score,
  null,
  'Aggregate MVUM routes should not imply campability before CampOps data exists',
);
assert(
  calIdaAggregate.verifiedRoute.minimum_fuel_range_miles >= calIdaAggregate.verifiedRoute.distance_miles,
  'Aggregate MVUM routes should carry minimum fuel range criteria for vehicle filtering',
);
assert.strictEqual(
  calIdaAggregate.verifiedRoute.route_intelligence.sourceFeatureCount,
  2,
  'Aggregate MVUM route intelligence should expose source feature count for transparency',
);
assert.deepStrictEqual(calIdaAggregate.verifiedRoute.vehicle_fit, ['highway_legal_4x4', 'full_size_4x4']);
assert(calIdaAggregate.verifiedRoute.tags.includes('source-segment aggregate'));
assert(calIdaAggregate.verifiedRoute.warning_reasons.some((warning) => /source-segment aggregate/i.test(warning)));
assert(calIdaAggregate.verifiedRoute.confidence_reasons.some((reason) => /2 MVUM source segments/i.test(reason)));
assert.deepStrictEqual(calIdaAggregate.segmentPublicIds.sort(), [
  'usfs-mvum-tahoe-national-forest-road-0035-cal-ida-scales-feature-101',
  'usfs-mvum-tahoe-national-forest-road-0035-cal-ida-scales-feature-102',
]);
assert.deepStrictEqual(calIdaAggregate.verifiedRouteSource.metadata.providerFeatureIds.sort(), [
  'road:0035:101',
  'road:0035:102',
]);
assert.deepStrictEqual(
  calIdaAggregate.verifiedRoute.community_signal.activeGuidance,
  {
    status: 'ready',
    topologyResolved: true,
    sourceSegmentCount: 2,
    componentCount: 1,
    branchDetected: false,
    joinedSegmentGapCount: 1,
    disjointSegmentGapCount: 0,
    maxJoinGapMeters: 0,
    maxSegmentGapMeters: 0,
    unavailableReason: null,
  },
  'Aggregate MVUM records should publish server-side active-guidance topology readiness',
);
assert.deepStrictEqual(
  calIdaAggregate.verifiedRouteSource.metadata.activeGuidance,
  calIdaAggregate.verifiedRoute.community_signal.activeGuidance,
  'Source attribution metadata should carry the same active-guidance assessment',
);

const tahoeBranchAggregate = aggregateUsfsMvumRouteFeatures(
  [
    {
      attributes: {
        FID: 111,
        RTE_CN: 'branch',
        ID: '0099',
        NAME: 'BRANCHING RIDGE',
        GIS_MILES: 1.1,
        HIGHCLEARA: 'open',
        FOURWD_GT5: 'open',
        FORESTNAME: 'Tahoe National Forest',
      },
      geometry: { paths: [[[-120.1, 39.1], [-120.09, 39.11]]] },
    },
    {
      attributes: {
        FID: 112,
        RTE_CN: 'branch',
        ID: '0099',
        NAME: 'BRANCHING RIDGE',
        GIS_MILES: 1.2,
        HIGHCLEARA: 'open',
        FOURWD_GT5: 'open',
        FORESTNAME: 'Tahoe National Forest',
      },
      geometry: { paths: [[[-120.09, 39.11], [-120.08, 39.12]]] },
    },
    {
      attributes: {
        FID: 113,
        RTE_CN: 'branch',
        ID: '0099',
        NAME: 'BRANCHING RIDGE',
        GIS_MILES: 1.3,
        HIGHCLEARA: 'open',
        FOURWD_GT5: 'open',
        FORESTNAME: 'Tahoe National Forest',
      },
      geometry: { paths: [[[-120.09, 39.11], [-120.10, 39.12]]] },
    },
  ],
  {
    forest: USFS_MVUM_PILOT_FORESTS[0],
    layer: USFS_MVUM_LAYERS.find((layer) => layer.kind === 'road'),
    sourceId: '00000000-0000-0000-0000-000000000001',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  },
);
const branchingRidgeAggregate = tahoeBranchAggregate.find(
  (aggregate) => aggregate.verifiedRoute.public_id === 'usfs-mvum-tahoe-national-forest-road-0099-branching-ridge',
);
assert(branchingRidgeAggregate, 'Branching source features should still publish a previewable aggregate record');
assert.strictEqual(branchingRidgeAggregate.verifiedRoute.community_signal.activeGuidance.status, 'preview_only');
assert.strictEqual(branchingRidgeAggregate.verifiedRoute.community_signal.activeGuidance.branchDetected, true);
assert.strictEqual(branchingRidgeAggregate.verifiedRoute.community_signal.activeGuidance.topologyResolved, false);
assert.match(
  branchingRidgeAggregate.verifiedRoute.community_signal.activeGuidance.unavailableReason,
  /branching source network/i,
  'Branching MVUM aggregates should explain why active guidance is unavailable',
);
assert(
  branchingRidgeAggregate.verifiedRoute.warning_reasons.some((warning) => /branching source network/i.test(warning)),
  'Preview-only topology should be visible in aggregate route warnings',
);

const mendocinoTrail = arcGisFeatureToVerifiedRouteUpsert(
  {
    attributes: {
      FID: 202,
      ID: '85346',
      NAME: 'LITTLE SULLIVAN RIDGE',
      GIS_MILES: 1.775,
      HIGHCLEARA: 'open',
      FOURWD_GT5: 'open',
      FORESTNAME: 'Mendocino National Forest',
      DISTRICTNA: 'Grindstone Ranger District',
      TRAILSTATU: 'EX - EXISTING',
    },
    geometry: {
      paths: [
        [
          [-122.6123, 39.7812],
          [-122.6023, 39.7912],
        ],
      ],
    },
  },
  {
    forest: USFS_MVUM_PILOT_FORESTS[1],
    layer: USFS_MVUM_LAYERS.find((layer) => layer.kind === 'trail'),
    sourceId: '00000000-0000-0000-0000-000000000002',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  },
);
assert(mendocinoTrail, 'A Mendocino official MVUM trail with geometry should produce a route upsert');
assert.strictEqual(mendocinoTrail.verifiedRoute.public_id, 'usfs-mvum-mendocino-national-forest-trail-85346-little-sullivan-ridge-feature-202');
assert.strictEqual(mendocinoTrail.verifiedRoute.name, 'Trail 85346 Little Sullivan Ridge');

assert.strictEqual(
  arcGisFeatureToVerifiedRouteUpsert(
    { attributes: { ID: 'SHORT', NAME: 'Short', GIS_MILES: 0.25, FORESTNAME: 'Tahoe National Forest' }, geometry: { paths: [[[-120, 39], [-120.01, 39.01]]] } },
    { forest: USFS_MVUM_PILOT_FORESTS[0], layer: USFS_MVUM_LAYERS[0], sourceId: 'source', sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z', minMiles: 1 },
  ),
  null,
  'Importer should not publish tiny MVUM stubs as public route suggestions',
);
assert.strictEqual(
  arcGisFeatureToVerifiedRouteUpsert(
    { attributes: { ID: 'NO-GEOM', NAME: 'No Geometry', GIS_MILES: 2, FORESTNAME: 'Tahoe National Forest' } },
    { forest: USFS_MVUM_PILOT_FORESTS[0], layer: USFS_MVUM_LAYERS[0], sourceId: 'source', sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z', minMiles: 1 },
  ),
  null,
  'Importer should not publish features without usable geometry',
);

const normalized = normalizeUsfsMvumFeatureCollection({ features: [tahoeFeature] });
assert.strictEqual(normalized.length, 1);
assert.strictEqual(normalized[0].attributes.FORESTNAME, 'Tahoe National Forest');

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-usfs-mvum', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'USFS MVUM sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'Sync function should require a server-side sync token');
assert(syncFunction.includes('route_sources') && syncFunction.includes('verified_routes'));
assert(!syncFunction.includes("'OBJECTID'"), 'Sync function should not request OBJECTID because the MVUM layer uses FID');
assert(!syncFunction.includes("'GLOBALID'"), 'Sync function should not request GLOBALID because the MVUM trails layer omits it');
assert(syncFunction.includes('payload.error'), 'Sync function should fail loudly on ArcGIS query error payloads');
assert(syncFunction.includes('aggregateUsfsMvumRouteFeatures'), 'Sync function should publish named MVUM aggregate route records');
assert(syncFunction.includes('publicRecommendation: false'), 'Sync function should keep individual MVUM source segments out of public recommendations');
assert(syncFunction.includes('aggregateRouteCount'), 'Sync function should report aggregate route counts');
assert(syncFunction.includes('segmentRouteRows'), 'Sync function should batch source segment route upserts to stay within Edge compute limits');
assert(syncFunction.includes('aggregateRouteRows'), 'Sync function should batch aggregate route upserts to stay within Edge compute limits');
assert(syncFunction.includes('buildRouteIdByPublicId'), 'Sync function should map bulk-upserted public IDs back to database IDs');

console.log('USFS MVUM pilot ingest checks passed');

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
  applyUsfsMvumCurrentConditionSources,
  aggregateUsfsMvumRouteFeatures,
  arcGisFeatureToVerifiedRouteUpsert,
  buildUsfsMvumWhereClause,
  normalizeUsfsMvumCurrentConditionSources,
  normalizeUsfsMvumFeatureCollection,
  routeCurrentConditionSourceUpsertForForest,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogUsfsMvum.ts'));

const expectedUsfsMvumForestSlugs = [
    'tahoe-national-forest',
    'mendocino-national-forest',
    'san-juan-national-forest',
    'coconino-national-forest',
    'manti-la-sal-national-forest',
    'sawtooth-national-forest',
    'deschutes-national-forest',
    'kaibab-national-forest',
    'prescott-national-forest',
    'gila-national-forest',
    'santa-fe-national-forest',
    'carson-national-forest',
    'rio-grande-national-forest',
    'grand-mesa-uncompahgre-gunnison-national-forests',
    'humboldt-toiyabe-national-forest',
    'pike-san-isabel-national-forests',
    'inyo-national-forest',
    'plumas-national-forest',
    'lassen-national-forest',
    'shasta-trinity-national-forest',
    'umpqua-national-forest',
    'fremont-winema-national-forest',
    'idaho-panhandle-national-forests',
    'helena-lewis-and-clark-national-forest',
    'fishlake-national-forest',
    'black-hills-national-forest',
    'uinta-wasatch-cache-national-forest',
    'caribou-targhee-national-forest',
    'klamath-national-forest',
    'willamette-national-forest',
    'boise-national-forest',
    'lolo-national-forest',
    'salmon-challis-national-forest',
    'stanislaus-national-forest',
    'dixie-national-forest',
    'bitterroot-national-forest',
    'mt-hood-national-forest',
    'coronado-national-forest',
    'sierra-national-forest',
    'huron-manistee-national-forest',
    'ozark-st-francis-national-forest',
    'ottawa-national-forest',
    'hiawatha-national-forest',
    'chequamegon-nicolet-national-forest',
    'national-forests-in-florida',
    'ouachita-national-forest',
    'mark-twain-national-forest',
    'national-forests-in-mississippi',
    'kisatchie-national-forest',
    'george-washington-jefferson-national-forest',
    'francis-marion-sumter-national-forests',
    'national-forests-in-texas',
    'national-forests-in-north-carolina',
    'allegheny-national-forest',
    'cherokee-national-forest',
    'daniel-boone-national-forest',
    'rogue-river-siskiyou-national-forests',
    'medicine-bow-routt-national-forest',
    'kootenai-national-forest',
    'gifford-pinchot-national-forest',
    'arapaho-roosevelt-national-forests',
    'umatilla-national-forest',
    'ochoco-national-forest',
    'cibola-national-forest',
    'eldorado-national-forest',
    'nez-perce-clearwater-national-forest',
    'payette-national-forest',
    'superior-national-forest',
    'chippewa-national-forest',
    'sequoia-national-forest',
    'ashley-national-forest',
    'bridger-teton-national-forest',
    'siuslaw-national-forest',
    'lincoln-national-forest',
    'white-river-national-forest',
    'mt-baker-snoqualmie-national-forest',
    'flathead-national-forest',
    'olympic-national-forest',
    'custer-national-forest',
    'bighorn-national-forest',
];

const expectedUsfsMvumForestNames = [
  'Tahoe National Forest',
  'Mendocino National Forest',
  'San Juan National Forest',
  'Coconino National Forest',
  'Manti-La Sal National Forest',
  'Sawtooth National Forest',
  'Deschutes National Forest',
  'Kaibab National Forest',
  'Prescott National Forest',
  'Gila National Forest',
  'Santa Fe National Forest',
  'Carson National Forest',
  'Rio Grande National Forest',
  'Grand Mesa, Uncompahgre and Gunnison National Forests',
  'Humboldt-Toiyabe National Forest',
  'Pike and San Isabel National Forests',
  'Inyo National Forest',
  'Plumas National Forest',
  'Lassen National Forest',
  'Shasta-Trinity National Forest',
  'Umpqua National Forest',
  'Fremont-Winema National Forest',
  'Idaho Panhandle National Forests',
  'Helena-Lewis and Clark National Forest',
  'Fishlake National Forest',
  'Black Hills National Forest',
  'Uinta-Wasatch-Cache National Forest',
  'Caribou-Targhee National Forest',
  'Klamath National Forest',
  'Willamette National Forest',
  'Boise National Forest',
  'Lolo National Forest',
  'Salmon-Challis National Forest',
  'Stanislaus National Forest',
  'Dixie National Forest',
  'Bitterroot National Forest',
  'Mt. Hood National Forest',
  'Coronado National Forest',
  'Sierra National Forest',
  'Huron-Manistee National Forest',
  'Ozark-St. Francis National Forest',
  'Ottawa National Forest',
  'Hiawatha National Forest',
  'Chequamegon-Nicolet National Forest',
  'National Forests in Florida',
  'Ouachita National Forest',
  'Mark Twain National Forest',
  'National Forests in Mississippi',
  'Kisatchie National Forest',
  'George Washington and Jefferson National Forest',
  'Francis Marion and Sumter National Forests',
  'National Forests in Texas',
  'National Forests in North Carolina',
  'Allegheny National Forest',
  'Cherokee National Forest',
  'Daniel Boone National Forest',
  'Rogue River-Siskiyou National Forests',
  'Medicine Bow-Routt National Forest',
  'Kootenai National Forest',
  'Gifford Pinchot National Forest',
  'Arapaho and Roosevelt National Forests',
  'Umatilla National Forest',
  'Ochoco National Forest',
  'Cibola National Forest',
  'Eldorado National Forest',
  'Nez Perce-Clearwater National Forest',
  'Payette National Forest',
  'Superior National Forest',
  'Chippewa National Forest',
  'Sequoia National Forest',
  'Ashley National Forest',
  'Bridger-Teton National Forest',
  'Siuslaw National Forest',
  'Lincoln National Forest',
  'White River National Forest',
  'Mt. Baker-Snoqualmie National Forest',
  'Flathead National Forest',
  'Olympic National Forest',
  'Custer National Forest',
  'Bighorn National Forest',
];

assert.deepStrictEqual(
  USFS_MVUM_PILOT_FORESTS.map((forest) => forest.slug),
  expectedUsfsMvumForestSlugs,
  'MVUM pilot forests should include every verified public recommendation expansion batch',
);
assert(
  USFS_MVUM_LAYERS.some((layer) => layer.kind === 'road' && layer.url.includes('Motor_Vehicle_Use_Map_Roads')) &&
    USFS_MVUM_LAYERS.some((layer) => layer.kind === 'trail' && layer.url.includes('Motor_Vehicle_Use_Maps_Trails')),
  'Importer should use the official Forest Service MVUM road and trail FeatureServer layers',
);

const where = buildUsfsMvumWhereClause(USFS_MVUM_PILOT_FORESTS, { minMiles: 1 });
for (const forestName of expectedUsfsMvumForestNames) {
  assert(where.includes(forestName), `MVUM where clause should include ${forestName}`);
}
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

const normalizedCurrentConditionSources = normalizeUsfsMvumCurrentConditionSources(
  {
    'tahoe-national-forest': {
      checkedAt: '2026-06-01T12:00:00.000Z',
      sourceUrl: 'https://www.fs.usda.gov/r05/tahoe/alerts',
      closures: [
        {
          routePublicId: 'usfs-mvum-tahoe-national-forest-road-0035-cal-ida-scales',
          title: 'Cal Ida Scales temporary closure',
          summary: 'Official alert closes the Cal Ida Scales route for public safety.',
          status: 'active',
          closureType: 'land_manager',
          sourceUrl: 'https://www.fs.usda.gov/r05/tahoe/alerts/cal-ida-scales-closure',
          forestOrder: '#17-26-99',
        },
      ],
    },
  },
  USFS_MVUM_PILOT_FORESTS,
  '2026-06-01T12:00:00.000Z',
);
assert.strictEqual(normalizedCurrentConditionSources.length, 1, 'Current-condition overlays should normalize by forest slug');
assert.strictEqual(
  normalizedCurrentConditionSources[0].providerId,
  'usfs_current_conditions_tahoe_nf',
  'Tahoe current-condition overlays should attach the official source provider id',
);
assert.strictEqual(
  normalizedCurrentConditionSources[0].closures[0].closureType,
  'land_manager',
  'Closure type should normalize into the route_closures enum shape',
);
assert.strictEqual(
  normalizeUsfsMvumCurrentConditionSources(
    {
      forestSlug: 'mendocino-national-forest',
      closures: [{ title: 'Trail 34 closure', status: 'active', routeId: '34' }],
    },
    USFS_MVUM_PILOT_FORESTS,
    '2026-06-01T12:00:00.000Z',
  )[0].providerId,
  'usfs_current_conditions_mendocino_nf',
  'Current-condition input should accept a single source object as well as a forest-keyed object',
);

const closureSourceUpsert = routeCurrentConditionSourceUpsertForForest(
  USFS_MVUM_PILOT_FORESTS[0],
  normalizedCurrentConditionSources[0],
);
assert.strictEqual(closureSourceUpsert.provider_id, 'usfs_current_conditions_tahoe_nf');
assert.strictEqual(closureSourceUpsert.authority, 'official_closure');
assert.strictEqual(closureSourceUpsert.source_uri, 'https://www.fs.usda.gov/r05/tahoe/alerts');

const blockedCalIdaAggregate = applyUsfsMvumCurrentConditionSources(
  calIdaAggregate,
  normalizedCurrentConditionSources,
);
assert.strictEqual(
  blockedCalIdaAggregate.verifiedRoute.recommendation_status,
  'not_recommended',
  'Active official current-condition closures must remove matched routes from public recommendation',
);
assert.strictEqual(blockedCalIdaAggregate.verifiedRoute.verification_status, 'not_recommended');
assert.strictEqual(blockedCalIdaAggregate.verifiedRoute.active_closure_count, 1);
assert(
  blockedCalIdaAggregate.verifiedRoute.blocker_reasons.some((reason) => /active official closure/i.test(reason)),
  'Closure overlays should add deterministic blocker reasons',
);
assert(
  blockedCalIdaAggregate.verifiedRoute.closure_summaries.some((summary) => /Cal Ida Scales temporary closure/i.test(summary)),
  'Closure overlays should preserve human-readable official closure summaries',
);
assert(
  blockedCalIdaAggregate.verifiedRoute.warning_reasons.some((warning) => /current-condition source/i.test(warning)),
  'Closure overlays should expose current-condition source freshness in warnings',
);
assert.strictEqual(
  blockedCalIdaAggregate.verifiedRoute.community_signal.currentConditions.activeClosureCount,
  1,
  'Closure overlays should expose matched current-condition counts without inventing live passability',
);
assert.strictEqual(
  blockedCalIdaAggregate.verifiedRouteSource.metadata.currentConditions.activeClosureCount,
  1,
  'Source attribution metadata should carry the same current-condition closure counts',
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
assert(syncFunction.includes('publicRecommendationCount'), 'Sync function should report public recommendation counts for recommendable MVUM aggregates');
assert(
  syncFunction.includes('maxAllowableOffset') &&
    syncFunction.includes('max_allowable_offset') &&
    syncFunction.includes('MAX_USFS_MVUM_ARCGIS_OFFSET_DEGREES'),
  'Sync function should request bounded ArcGIS geometry simplification so dense MVUM trail geometries do not time out Edge syncs',
);
assert(syncFunction.includes('segmentRouteRows'), 'Sync function should batch source segment route upserts to stay within Edge compute limits');
assert(syncFunction.includes('aggregateRouteRows'), 'Sync function should batch aggregate route upserts to stay within Edge compute limits');
assert(syncFunction.includes('buildRouteIdByPublicId'), 'Sync function should map bulk-upserted public IDs back to database IDs');
assert(
  syncFunction.includes('normalizeUsfsMvumCurrentConditionSources') &&
    syncFunction.includes('applyUsfsMvumCurrentConditionSources') &&
    syncFunction.includes('routeCurrentConditionSourceUpsertForForest'),
  'Sync function should ingest reviewed official current-condition overlays through the deterministic closure gate',
);
assert(
  syncFunction.includes('currentConditionBlockedRouteCount'),
  'Sync summaries should report how many MVUM records were blocked by current-condition closures',
);

console.log('USFS MVUM pilot ingest checks passed');

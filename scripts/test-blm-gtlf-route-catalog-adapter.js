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
  BLM_GTLF_LAYERS,
  BLM_GTLF_SOURCE,
  applyBlmGtlfCurrentConditionSources,
  aggregateBlmGtlfRouteFeatures,
  arcGisFeatureToBlmGtlfRouteUpsert,
  blmGtlfSourceUpsert,
  buildBlmGtlfWhereClause,
  normalizeBlmGtlfCurrentConditionSources,
  normalizeBlmGtlfFeatureCollection,
  routeCurrentConditionSourceUpsertForBlmGtlf,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogBlmGtlf.ts'));

assert.strictEqual(BLM_GTLF_SOURCE.providerId, 'blm_gtlf');
assert(
  BLM_GTLF_LAYERS.some((layer) => layer.id === 0 && /Public Motorized Use/i.test(layer.name)) &&
    BLM_GTLF_LAYERS.some((layer) => layer.id === 1 && /Limited Public Motorized Use/i.test(layer.name)) &&
    BLM_GTLF_LAYERS.some((layer) => layer.id === 2 && /Trails Managed for Public Motorized Use/i.test(layer.name)) &&
    BLM_GTLF_LAYERS.some((layer) => layer.id === 3 && /Trails Managed for Limited Public Motorized Use/i.test(layer.name)),
  'BLM adapter should start with official motorized GTLF road/trail layers 0-3',
);

const where = buildBlmGtlfWhereClause(['CA', 'NV'], { minMiles: 1 });
assert(where.includes("ADMIN_ST in ('CA','NV')"));
assert(where.includes("DSTRBTE_EXTRNL_CODE = 'YES'"));
assert(where.includes("PLAN_ROUTE_DSGNTN_AUTH = 'BLM'"));
assert(where.includes('GIS_MILES >= 1'));

const sourceUpsert = blmGtlfSourceUpsert('2026-06-01T00:00:00.000Z');
assert.strictEqual(sourceUpsert.provider_id, 'blm_gtlf');
assert.strictEqual(sourceUpsert.authority, 'official_access');
assert(sourceUpsert.source_uri.includes('BLM_Natl_GTLF_Public_Display'));

const publicRoad = {
  attributes: {
    OBJECTID: 153800,
    ADMIN_ST: 'CA',
    PLAN_ROUTE_DSGNTN_AUTH: 'BLM',
    PLAN_ASSET_CLASS: 'TRANSPORTATION SYSTEM - PRIMITIVE ROAD',
    PLAN_OHV_ROUTE_DSGNTN: 'Open',
    PLAN_MODE_TRNSPRT: 'MOTORIZED',
    PLAN_ALLOW_MODE_TRNSPRT: 'TECH_VEH_SHARED',
    PLAN_ACCESS_RSTRCT: 'UNKNOWN',
    ROUTE_PLAN_ID: '403',
    ROUTE_PRMRY_NM: 'Panoche Access',
    GIS_MILES: 1.25,
    BLM_MILES: 1.24,
    OBSRVE_SRFCE_TYPE: 'NATURAL',
    GlobalID: '{F0729C07-219D-4F3C-9762-77780E574612}',
  },
  geometry: {
    paths: [
      [
        [-120.154933, 36.031128],
        [-120.154725, 36.030923],
        [-120.154512, 36.030747],
      ],
    ],
  },
};

const publicRoadUpsert = arcGisFeatureToBlmGtlfRouteUpsert(publicRoad, {
  layer: BLM_GTLF_LAYERS.find((layer) => layer.id === 0),
  sourceId: '00000000-0000-0000-0000-000000000010',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 1,
});

assert(publicRoadUpsert, 'A BLM public motorized road with geometry should produce a route-catalog source segment');
assert.strictEqual(publicRoadUpsert.verifiedRoute.public_id, 'blm-gtlf-ca-road-403-panoche-access-feature-153800');
assert.strictEqual(publicRoadUpsert.verifiedRoute.name, 'BLM Road 403 Panoche Access');
assert.strictEqual(publicRoadUpsert.verifiedRoute.review_status, 'approved');
assert.strictEqual(publicRoadUpsert.verifiedRoute.recommendation_status, 'not_recommended');
assert.strictEqual(publicRoadUpsert.verifiedRoute.verification_status, 'partially_verified');
assert.strictEqual(publicRoadUpsert.verifiedRoute.official_access_coverage_pct, 85);
assert.strictEqual(publicRoadUpsert.verifiedRoute.unknown_access_coverage_pct, 15);
assert.deepStrictEqual(publicRoadUpsert.verifiedRoute.vehicle_fit, ['full_size_4x4', 'atv', 'utv', 'motorcycle']);
assert.strictEqual(publicRoadUpsert.verifiedRoute.route_geometry.type, 'LineString');
assert(
  publicRoadUpsert.verifiedRoute.warning_reasons.some((warning) => /verify current use limitations/i.test(warning)),
  'BLM GTLF records should retain the official local-verification caveat',
);
assert(
  publicRoadUpsert.verifiedRoute.blocker_reasons.some((blocker) => /not yet curated/i.test(blocker)),
  'BLM source segments should not become public recommendations before curation/aggregation',
);
assert.strictEqual(publicRoadUpsert.verifiedRouteSource.route_source_id, '00000000-0000-0000-0000-000000000010');
assert.strictEqual(publicRoadUpsert.rawSourceFeature.provider_feature_id, 'blm-gtlf:0:153800');

const publicRoadContinuation = {
  attributes: {
    OBJECTID: 153801,
    ADMIN_ST: 'CA',
    PLAN_ROUTE_DSGNTN_AUTH: 'BLM',
    PLAN_ASSET_CLASS: 'TRANSPORTATION SYSTEM - PRIMITIVE ROAD',
    PLAN_OHV_ROUTE_DSGNTN: 'Open',
    PLAN_MODE_TRNSPRT: 'MOTORIZED',
    PLAN_ALLOW_MODE_TRNSPRT: 'TECH_VEH_SHARED',
    PLAN_ACCESS_RSTRCT: 'UNKNOWN',
    ROUTE_PLAN_ID: '403',
    ROUTE_PRMRY_NM: 'Panoche Access',
    GIS_MILES: 1.75,
    BLM_MILES: 1.74,
    OBSRVE_SRFCE_TYPE: 'NATURAL',
    GlobalID: '{BCA40300-219D-4F3C-9762-77780E574612}',
  },
  geometry: {
    paths: [
      [
        [-120.154512, 36.030747],
        [-120.15401, 36.03012],
        [-120.1535, 36.02955],
      ],
    ],
  },
};

const publicBlmAggregates = aggregateBlmGtlfRouteFeatures(
  [publicRoad, publicRoadContinuation],
  {
    layer: BLM_GTLF_LAYERS.find((layer) => layer.id === 0),
    sourceId: '00000000-0000-0000-0000-000000000010',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  },
);
assert.strictEqual(publicBlmAggregates.length, 1, 'Open BLM public motorized segments with one route identity should aggregate');
assert.strictEqual(publicBlmAggregates[0].verifiedRoute.public_id, 'blm-gtlf-ca-road-403-panoche-access');
assert.strictEqual(publicBlmAggregates[0].verifiedRoute.recommendation_status, 'recommendable');
assert.strictEqual(publicBlmAggregates[0].verifiedRoute.verification_status, 'official_verified');
assert.strictEqual(publicBlmAggregates[0].verifiedRoute.review_status, 'approved');
assert.strictEqual(publicBlmAggregates[0].verifiedRoute.official_access_coverage_pct, 90);
assert.strictEqual(publicBlmAggregates[0].verifiedRoute.unknown_access_coverage_pct, 10);
assert.deepStrictEqual(publicBlmAggregates[0].verifiedRoute.vehicle_fit, ['full_size_4x4', 'atv', 'utv', 'motorcycle']);
assert.strictEqual(publicBlmAggregates[0].verifiedRoute.distance_miles, 3);
assert.deepStrictEqual(publicBlmAggregates[0].segmentPublicIds, [
  'blm-gtlf-ca-road-403-panoche-access-feature-153800',
  'blm-gtlf-ca-road-403-panoche-access-feature-153801',
]);
assert(
  publicBlmAggregates[0].verifiedRoute.confidence_reasons.some((reason) => /2 BLM GTLF source segments/i.test(reason)),
  'BLM aggregate confidence should cite the official source-segment count',
);
assert(
  publicBlmAggregates[0].verifiedRoute.warning_reasons.some((warning) => /verify current use limitations/i.test(warning)),
  'BLM aggregate recommendations should retain the current-conditions caveat',
);
assert.strictEqual(publicBlmAggregates[0].verifiedRoute.blocker_reasons.length, 0);

const normalizedBlmCurrentConditionSources = normalizeBlmGtlfCurrentConditionSources(
  {
    california: {
      checkedAt: '2026-06-05T12:00:00.000Z',
      sourceUrl: 'https://www.blm.gov/alerts/panoche-access-temporary-closure',
      closures: [
        {
          title: 'Panoche Access temporary public safety closure',
          summary: 'Official BLM closure notice closes route 403 while crews complete emergency repairs.',
          status: 'active',
          closureType: 'land_manager',
          routePlanId: '403',
          sourceUrl: 'https://www.blm.gov/alerts/panoche-access-temporary-closure',
        },
      ],
    },
  },
  ['CA', 'UT'],
  '2026-06-05T12:00:00.000Z',
);
assert.strictEqual(normalizedBlmCurrentConditionSources.length, 1, 'BLM closure overlays should normalize by state key');
assert.strictEqual(
  normalizedBlmCurrentConditionSources[0].providerId,
  'blm_current_conditions_ca',
  'BLM current-condition overlays should attach a state-scoped official source provider id',
);
assert.strictEqual(
  normalizedBlmCurrentConditionSources[0].closures[0].closureType,
  'land_manager',
  'BLM closure type should normalize into the route_closures enum shape',
);
assert.strictEqual(
  normalizeBlmGtlfCurrentConditionSources(
    {
      adminState: 'CA',
      closures: [{ title: 'Route 403 closure', status: 'active', routePlanId: '403' }],
    },
    ['CA'],
    '2026-06-05T12:00:00.000Z',
  )[0].providerId,
  'blm_current_conditions_ca',
  'BLM current-condition input should accept a single source object as well as a state-keyed object',
);

const blmClosureSourceUpsert = routeCurrentConditionSourceUpsertForBlmGtlf(normalizedBlmCurrentConditionSources[0]);
assert.strictEqual(blmClosureSourceUpsert.provider_id, 'blm_current_conditions_ca');
assert.strictEqual(blmClosureSourceUpsert.authority, 'official_closure');
assert.strictEqual(
  blmClosureSourceUpsert.source_uri,
  'https://www.blm.gov/alerts/panoche-access-temporary-closure',
);

const blockedPublicBlmAggregate = applyBlmGtlfCurrentConditionSources(
  publicBlmAggregates[0],
  normalizedBlmCurrentConditionSources,
);
assert.strictEqual(
  blockedPublicBlmAggregate.verifiedRoute.recommendation_status,
  'not_recommended',
  'Active official BLM current-condition closures must remove matched routes from public recommendation',
);
assert.strictEqual(blockedPublicBlmAggregate.verifiedRoute.verification_status, 'not_recommended');
assert.strictEqual(blockedPublicBlmAggregate.verifiedRoute.active_closure_count, 1);
assert(
  blockedPublicBlmAggregate.verifiedRoute.blocker_reasons.some((reason) => /active official closure/i.test(reason)),
  'BLM closure overlays should add deterministic blocker reasons',
);
assert(
  blockedPublicBlmAggregate.verifiedRoute.closure_summaries.some((summary) => /Panoche Access temporary public safety closure/i.test(summary)),
  'BLM closure overlays should preserve human-readable official closure summaries',
);
assert.strictEqual(
  blockedPublicBlmAggregate.verifiedRoute.community_signal.currentConditions.activeClosureCount,
  1,
  'BLM closure overlays should expose matched current-condition counts without inventing live passability',
);
assert.strictEqual(
  blockedPublicBlmAggregate.verifiedRouteSource.metadata.currentConditions.activeClosureCount,
  1,
  'BLM source attribution metadata should carry the same current-condition closure counts',
);

const nmFireRestrictionRoad = {
  attributes: {
    ...publicRoad.attributes,
    OBJECTID: 9102601,
    ADMIN_ST: 'NM',
    ROUTE_PLAN_ID: 'WR-1',
    ROUTE_PRMRY_NM: 'RINCONADA LOOP TRAIL',
    GIS_MILES: 2.25,
  },
  geometry: { paths: [[[-105.67, 36.68], [-105.66, 36.69]]] },
};
const publicNmBlmAggregates = aggregateBlmGtlfRouteFeatures(
  [nmFireRestrictionRoad],
  {
    layer: BLM_GTLF_LAYERS.find((layer) => layer.id === 0),
    sourceId: '00000000-0000-0000-0000-000000000011',
    sourceLastVerifiedAt: '2026-06-05T12:00:00.000Z',
    minMiles: 1,
  },
);
assert.strictEqual(publicNmBlmAggregates[0].verifiedRoute.recommendation_status, 'recommendable');

const normalizedBlmFireRestrictionSources = normalizeBlmGtlfCurrentConditionSources(
  {
    'new mexico': {
      checkedAt: '2026-06-05T12:00:00.000Z',
      sourceUrl: 'https://www.blm.gov/programs/fire/regional-info/new-mexico/fire-restrictions',
      advisories: [
        {
          title: 'Fire Prevention Order #NM910-26-01',
          summary: 'Statewide fire restrictions are in effect on BLM New Mexico lands.',
          status: 'active',
          advisoryType: 'fire_restriction',
          orderNumber: 'NM910-26-01',
          sourceUrl: 'https://www.blm.gov/sites/default/files/docs/2026-01/fire-prevention-order-blm-nm-910-2026-01.pdf',
        },
      ],
    },
  },
  ['NM'],
  '2026-06-05T12:00:00.000Z',
);
assert.strictEqual(
  Array.isArray(normalizedBlmFireRestrictionSources[0].advisories),
  true,
  'BLM current-condition sources should preserve official advisory records separately from closure records',
);
assert.strictEqual(
  normalizedBlmFireRestrictionSources[0].advisories[0]?.advisoryType,
  'fire_restriction',
  'BLM fire prevention orders should normalize as advisories instead of route closures',
);
const fireRestrictionAdvisoryAggregate = applyBlmGtlfCurrentConditionSources(
  publicNmBlmAggregates[0],
  normalizedBlmFireRestrictionSources,
);
assert.strictEqual(
  fireRestrictionAdvisoryAggregate.verifiedRoute.recommendation_status,
  'recommendable',
  'BLM fire restriction advisories should not remove source-backed routes from recommendation unless an actual closure is present',
);
assert.strictEqual(fireRestrictionAdvisoryAggregate.verifiedRoute.verification_status, 'official_verified');
assert.strictEqual(fireRestrictionAdvisoryAggregate.verifiedRoute.active_closure_count, 0);
assert(
  fireRestrictionAdvisoryAggregate.verifiedRoute.warning_reasons.some((warning) => /Fire Prevention Order #NM910-26-01/i.test(warning)),
  'BLM fire restriction advisories should appear as deterministic current-condition warnings',
);
assert.strictEqual(
  fireRestrictionAdvisoryAggregate.verifiedRoute.community_signal.currentConditions.activeAdvisoryCount,
  1,
  'BLM advisory overlays should expose active advisory counts separately from closure counts',
);
assert.strictEqual(
  fireRestrictionAdvisoryAggregate.verifiedRouteSource.metadata.currentConditions.activeAdvisoryCount,
  1,
  'BLM source attribution metadata should carry advisory counts without converting them into closures',
);

const publicBlmNoSeasonAggregates = aggregateBlmGtlfRouteFeatures(
  [
    {
      ...publicRoad,
      attributes: {
        ...publicRoad.attributes,
        PLAN_SEASON_RSTRCT_CODE: 'NO',
      },
    },
    {
      ...publicRoadContinuation,
      attributes: {
        ...publicRoadContinuation.attributes,
        PLAN_SEASON_RSTRCT_CODE: 'NO',
      },
    },
  ],
  {
    layer: BLM_GTLF_LAYERS.find((layer) => layer.id === 0),
    sourceId: '00000000-0000-0000-0000-000000000010',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  },
);
assert.strictEqual(
  publicBlmNoSeasonAggregates.length,
  1,
  'BLM GTLF season code NO means no seasonal restriction and should still allow strict public aggregates',
);
assert.strictEqual(publicBlmNoSeasonAggregates[0].verifiedRoute.seasonal_restriction_count, 0);

const anonymousWyPublicRoad = {
  attributes: {
    OBJECTID: 77001,
    ADMIN_ST: 'WY',
    PLAN_ROUTE_DSGNTN_AUTH: 'BLM',
    PLAN_ASSET_CLASS: 'TRANSPORTATION SYSTEM - PRIMITIVE ROAD',
    PLAN_OHV_ROUTE_DSGNTN: 'Open',
    PLAN_MODE_TRNSPRT: 'MOTORIZED',
    PLAN_ALLOW_MODE_TRNSPRT: 'TECH_VEH_SHARED',
    PLAN_ACCESS_RSTRCT: 'UNKNOWN',
    GIS_MILES: 2.1,
    BLM_MILES: 2.08,
    OBSRVE_SRFCE_TYPE: 'NATURAL',
    GlobalID: '{WY770010-219D-4F3C-9762-77780E574612}',
  },
  geometry: {
    paths: [
      [
        [-108.91, 42.11],
        [-108.92, 42.12],
        [-108.94, 42.13],
      ],
    ],
  },
};

const anonymousWyAggregates = aggregateBlmGtlfRouteFeatures(
  [anonymousWyPublicRoad],
  {
    layer: BLM_GTLF_LAYERS.find((layer) => layer.id === 0),
    sourceId: '00000000-0000-0000-0000-000000000010',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  },
);
assert.strictEqual(
  anonymousWyAggregates.length,
  1,
  'Open BLM GTLF source features without a named route identity should still promote through strict source-feature aggregation',
);
assert.strictEqual(anonymousWyAggregates[0].verifiedRoute.public_id, 'blm-gtlf-wy-road-segment-77001');
assert.strictEqual(anonymousWyAggregates[0].verifiedRoute.recommendation_status, 'recommendable');
assert.strictEqual(anonymousWyAggregates[0].verifiedRoute.verification_status, 'official_verified');
assert.strictEqual(anonymousWyAggregates[0].verifiedRoute.route_intelligence.aggregation, 'blm_gtlf_source_feature');
assert.deepStrictEqual(anonymousWyAggregates[0].segmentPublicIds, ['blm-gtlf-wy-road-feature-77001']);
assert.strictEqual(anonymousWyAggregates[0].verifiedRoute.blocker_reasons.length, 0);

const limitedTrail = arcGisFeatureToBlmGtlfRouteUpsert(
  {
    attributes: {
      OBJECTID: 330,
      ADMIN_ST: 'NV',
      PLAN_ROUTE_DSGNTN_AUTH: 'BLM',
      PLAN_ASSET_CLASS: 'TRANSPORTATION SYSTEM - TRAIL',
      PLAN_OHV_ROUTE_DSGNTN: 'Limited',
      OHV_ROUTE_DSGNTN_LIM: 'LIMITED BY SEASON',
      OHV_DSGNTN_LIM_EXPLAIN: 'Seasonal wildlife closure may apply.',
      PLAN_MODE_TRNSPRT: 'MOTORIZED',
      PLAN_ALLOW_MODE_TRNSPRT: 'MTC_ATV_UTV_ONLY',
      ROUTE_PRMRY_NM: 'Desert Trail',
      GIS_MILES: 2.5,
    },
    geometry: { paths: [[[-116.1, 37.1], [-116.2, 37.2]]] },
  },
  {
    layer: BLM_GTLF_LAYERS.find((layer) => layer.id === 3),
    sourceId: '00000000-0000-0000-0000-000000000010',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  },
);
assert(limitedTrail, 'A limited public motorized trail should still produce a non-public source segment');
assert.strictEqual(limitedTrail.verifiedRoute.seasonal_restriction_count, 1);
assert.deepStrictEqual(limitedTrail.verifiedRoute.vehicle_fit, ['atv', 'utv', 'motorcycle']);
assert(
  limitedTrail.verifiedRoute.warning_reasons.some((warning) => /limited by season/i.test(warning)),
  'Limited BLM route designations should expose their limitation text',
);
assert.strictEqual(
  aggregateBlmGtlfRouteFeatures(
    [
      {
        attributes: {
          OBJECTID: 330,
          ADMIN_ST: 'NV',
          PLAN_ROUTE_DSGNTN_AUTH: 'BLM',
          PLAN_ASSET_CLASS: 'TRANSPORTATION SYSTEM - TRAIL',
          PLAN_OHV_ROUTE_DSGNTN: 'Limited',
          OHV_ROUTE_DSGNTN_LIM: 'LIMITED BY SEASON',
          OHV_DSGNTN_LIM_EXPLAIN: 'Seasonal wildlife closure may apply.',
          PLAN_MODE_TRNSPRT: 'MOTORIZED',
          PLAN_ALLOW_MODE_TRNSPRT: 'MTC_ATV_UTV_ONLY',
          ROUTE_PRMRY_NM: 'Desert Trail',
          GIS_MILES: 2.5,
        },
        geometry: { paths: [[[-116.1, 37.1], [-116.2, 37.2]]] },
      },
    ],
    {
      layer: BLM_GTLF_LAYERS.find((layer) => layer.id === 3),
      sourceId: '00000000-0000-0000-0000-000000000010',
      sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
      minMiles: 1,
    },
  ).length,
  0,
  'Limited BLM GTLF records must stay curation-only instead of becoming public aggregates',
);

assert.strictEqual(
  arcGisFeatureToBlmGtlfRouteUpsert(
    {
      attributes: {
        OBJECTID: 999,
        ADMIN_ST: 'CA',
        PLAN_ROUTE_DSGNTN_AUTH: 'BLM',
        PLAN_OHV_ROUTE_DSGNTN: 'Closed',
        PLAN_MODE_TRNSPRT: 'MOTORIZED',
        GIS_MILES: 3,
      },
      geometry: { paths: [[[-120, 36], [-120.01, 36.01]]] },
    },
    {
      layer: BLM_GTLF_LAYERS[0],
      sourceId: 'source',
      sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
      minMiles: 1,
    },
  ),
  null,
  'Closed BLM features must not be normalized into route suggestions',
);

const normalized = normalizeBlmGtlfFeatureCollection({ features: [publicRoad] });
assert.strictEqual(normalized.length, 1);
assert.strictEqual(normalized[0].attributes.ADMIN_ST, 'CA');

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-blm-gtlf', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'BLM GTLF sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'BLM sync should require the server-side route catalog sync token');
assert(syncFunction.includes('route_sources') && syncFunction.includes('verified_routes'));
assert(syncFunction.includes('limitPerStateLayer'), 'BLM sync should bound live ArcGIS page sizes');
assert(
  syncFunction.includes('normalizeBlmGtlfCurrentConditionSources') &&
    syncFunction.includes('applyBlmGtlfCurrentConditionSources') &&
    syncFunction.includes('routeCurrentConditionSourceUpsertForBlmGtlf'),
  'BLM sync should ingest reviewed official current-condition overlays through the deterministic closure gate',
);
assert(
  syncFunction.includes('currentConditionBlockedRouteCount') &&
    syncFunction.includes('currentConditionAdvisoryCount'),
  'BLM sync summaries should report how many GTLF records were blocked by current-condition closures and how many advisories were checked',
);
assert(
  syncFunction.includes('aggregateBlmGtlfRouteFeatures') &&
    syncFunction.includes('aggregateRouteCount') &&
    syncFunction.includes('publicRecommendationCount += layerPublicRecommendationCount'),
  'BLM sync should promote strict public-motorized aggregates and report closure-gated public recommendation telemetry',
);
assert(!syncFunction.includes('RIDB_API_KEY') && !syncFunction.includes('NPS_API_KEY'), 'BLM sync must not expose campground provider secrets');

const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-blm-gtlf-sync.yml');
assert(fs.existsSync(workflowPath), 'BLM GTLF durable sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert(
  syncFunction.includes("const DEFAULT_STATES = ['AK', 'AZ', 'CA', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY'];"),
  'BLM GTLF sync should default to the verified Alaska and western-state public recommendation batch',
);
assert(
  workflow.includes('default: AK,AZ,CA,CO,ID,MT,NV,NM,UT,WY') &&
    workflow.includes("STATES: ${{ inputs.states || 'AK,AZ,CA,CO,ID,MT,NV,NM,UT,WY' }}"),
  'BLM GTLF workflow defaults should sync the verified Alaska and western-state batch',
);
assert(
  workflow.includes('route-catalog-blm-gtlf-sync-payloads.json') &&
    workflow.includes('states: [state]') &&
    workflow.includes('route-catalog-blm-gtlf-sync-responses'),
  'BLM GTLF workflow should split expanded batches into per-state Edge Function payloads',
);
assert(
  workflow.includes('aggregateRouteCount') && workflow.includes('Public aggregate routes'),
  'BLM sync workflow summary should expose aggregate route counts separately from raw source segments',
);

console.log('BLM GTLF route catalog adapter checks passed');

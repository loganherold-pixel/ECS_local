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
  arcGisFeatureToBlmGtlfRouteUpsert,
  blmGtlfSourceUpsert,
  buildBlmGtlfWhereClause,
  normalizeBlmGtlfFeatureCollection,
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
assert(!syncFunction.includes('RIDB_API_KEY') && !syncFunction.includes('NPS_API_KEY'), 'BLM sync must not expose campground provider secrets');

console.log('BLM GTLF route catalog adapter checks passed');

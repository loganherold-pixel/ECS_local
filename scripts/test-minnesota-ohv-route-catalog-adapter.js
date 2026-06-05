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
  MINNESOTA_OHV_DOWNLOADS,
  MINNESOTA_OHV_SOURCE,
  featureToMinnesotaOhvRouteUpsert,
  minnesotaOhvSourceUpsert,
  normalizeMinnesotaOhvFeatureCollection,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogMinnesotaOhv.ts'));

assert.strictEqual(MINNESOTA_OHV_SOURCE.providerId, 'minnesota_dnr_ohv_trails');
assert(MINNESOTA_OHV_SOURCE.sourceUri.includes('gisdata.mn.gov/dataset/trans-ohv-trails-mn'));
assert(MINNESOTA_OHV_DOWNLOADS.geopackage.includes('resources.gisdata.mn.gov'));
assert(MINNESOTA_OHV_DOWNLOADS.geopackage.includes('gpkg_trans_ohv_trails_mn.zip'));

const sourceUpsert = minnesotaOhvSourceUpsert('2026-06-01T00:00:00.000Z');
assert.strictEqual(sourceUpsert.provider_id, 'minnesota_dnr_ohv_trails');
assert.strictEqual(sourceUpsert.source_type, 'state_agency');
assert.strictEqual(sourceUpsert.authority, 'official_access');

const fullAccessFeature = {
  type: 'Feature',
  properties: {
    OBJECTID: 2001,
    TRAIL_NAME: 'Appleton Area Recreational Park',
    SEGMENT_NAME: 'ORV scramble loop',
    SURFACE_TYPE: 'Natural/Soil/Grass/ No Improvements',
    FUNDING_TYPE: 'State',
    TRAIL_WIDTH: 'Greater Than 10 Feet',
    ATV_CLASS_1: 'X',
    ATV_CLASS_2: 'X',
    OFF_HIGHWAY_MOTORCYCLE: 'X',
    OFF_ROAD_VEHICLE: 'X',
    ROAD_CLASS: 'Forest Road',
    MILES: 2.75,
    WEB_SITE: 'https://www.dnr.state.mn.us/ohv/trail_detail.html?id=1',
    STABLE_PROD_GUID: '174785D8-B40D-42C7-A3EF-71A13D98362B',
    PROGRAM_PROJECT: 'OHV00001',
  },
  geometry: {
    type: 'MultiLineString',
    coordinates: [
      [
        [-95.9891, 45.2041],
        [-95.985, 45.2046],
        [-95.981, 45.2052],
      ],
    ],
  },
};

const fullAccessUpsert = featureToMinnesotaOhvRouteUpsert(fullAccessFeature, {
  sourceId: '00000000-0000-0000-0000-000000000050',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 1,
});

assert(fullAccessUpsert, 'A Minnesota DNR OHV feature with public OHV classes and geometry should produce a public route-catalog recommendation record');
assert.strictEqual(fullAccessUpsert.verifiedRoute.public_id, 'minnesota-dnr-ohv-appleton-area-recreational-park-feature-2001');
assert.strictEqual(fullAccessUpsert.verifiedRoute.name, 'Minnesota DNR OHV Appleton Area Recreational Park - ORV Scramble Loop');
assert.strictEqual(fullAccessUpsert.verifiedRoute.recommendation_status, 'recommendable');
assert.strictEqual(fullAccessUpsert.verifiedRoute.verification_status, 'official_verified');
assert.strictEqual(fullAccessUpsert.verifiedRoute.review_status, 'approved');
assert.strictEqual(fullAccessUpsert.verifiedRoute.official_access_coverage_pct, 86);
assert.strictEqual(fullAccessUpsert.verifiedRoute.unknown_access_coverage_pct, 14);
assert.deepStrictEqual(fullAccessUpsert.verifiedRoute.vehicle_fit, ['full_size_4x4', 'atv', 'utv', 'motorcycle']);
assert.strictEqual(fullAccessUpsert.verifiedRoute.distance_miles, 2.75);
assert.strictEqual(fullAccessUpsert.verifiedRoute.route_geometry.type, 'MultiLineString');
assert(
  fullAccessUpsert.verifiedRoute.warning_reasons.some((warning) => /not to be used for navigation/i.test(warning)),
  'Minnesota OHV records should surface the metadata navigation/reference caveat',
);
assert.deepStrictEqual(fullAccessUpsert.verifiedRoute.blocker_reasons, []);
assert.strictEqual(fullAccessUpsert.rawSourceFeature.provider_feature_id, 'minnesota-dnr-ohv:2001');
assert.strictEqual(fullAccessUpsert.verifiedRouteSource.source_role, 'primary');

const atvOnlyFeature = {
  ...fullAccessFeature,
  properties: {
    ...fullAccessFeature.properties,
    OBJECTID: 2002,
    TRAIL_NAME: 'Agassiz Recreational Trail: Clay County',
    SEGMENT_NAME: null,
    ATV_CLASS_1: 'X',
    ATV_CLASS_2: 'X',
    OFF_HIGHWAY_MOTORCYCLE: null,
    OFF_ROAD_VEHICLE: null,
    MILES: 4,
  },
};
const atvOnlyUpsert = featureToMinnesotaOhvRouteUpsert(atvOnlyFeature, {
  sourceId: '00000000-0000-0000-0000-000000000050',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 1,
});
assert(atvOnlyUpsert, 'Minnesota ATV Class I/II records should normalize as ATV/UTV source-backed records');
assert.deepStrictEqual(atvOnlyUpsert.verifiedRoute.vehicle_fit, ['atv', 'utv']);
assert.strictEqual(atvOnlyUpsert.verifiedRoute.official_access_coverage_pct, 82);

assert.strictEqual(
  featureToMinnesotaOhvRouteUpsert(
    {
      ...fullAccessFeature,
      properties: {
        ...fullAccessFeature.properties,
        OBJECTID: 2003,
        ATV_CLASS_1: null,
        ATV_CLASS_2: null,
        OFF_HIGHWAY_MOTORCYCLE: null,
        OFF_ROAD_VEHICLE: null,
      },
    },
    {
      sourceId: 'source',
      sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
      minMiles: 1,
    },
  ),
  null,
  'Minnesota records without OHV class flags should not enter the overland route catalog adapter',
);

assert.strictEqual(
  featureToMinnesotaOhvRouteUpsert(
    {
      ...fullAccessFeature,
      properties: {
        ...fullAccessFeature.properties,
        OBJECTID: 2004,
        MILES: 0.25,
      },
    },
    {
      sourceId: 'source',
      sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
      minMiles: 1,
    },
  ),
  null,
  'Minnesota records below the configured minimum miles should be ignored',
);

const normalized = normalizeMinnesotaOhvFeatureCollection({ features: [fullAccessFeature] });
assert.strictEqual(normalized.length, 1);
assert.strictEqual(normalized[0].properties.TRAIL_NAME, 'Appleton Area Recreational Park');

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-minnesota-ohv', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'Minnesota DNR OHV sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'Minnesota OHV sync should require the server-side route catalog sync token');
assert(syncFunction.includes('route_sources') && syncFunction.includes('verified_routes'));
assert(syncFunction.includes('sourceFeatures'), 'Minnesota OHV sync should accept GeoPackage-converted sourceFeatures from the durable workflow');
assert(syncFunction.includes('countPublicRecommendations(routeRows)'), 'Minnesota OHV sync should report promoted public recommendation telemetry');
assert(syncFunction.includes('syncScope'), 'Minnesota OHV sync should preserve pilot/statewide scope telemetry');
assert(syncFunction.includes('maxFeatures'), 'Minnesota OHV sync should report bounded maxFeatures telemetry');

const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-minnesota-ohv-sync.yml');
assert(fs.existsSync(workflowPath), 'Minnesota DNR OHV sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert(workflow.includes('sync_scope:'), 'Minnesota OHV sync workflow should expose a pilot/statewide sync scope selector');
assert(workflow.includes('pilot') && workflow.includes('statewide'), 'Minnesota OHV sync workflow should document pilot and statewide scopes');
assert(workflow.includes('default: statewide'), 'Minnesota OHV sync workflow should default to the bounded statewide conversion path');
assert(
  workflow.includes("SYNC_SCOPE: ${{ inputs.sync_scope || 'statewide' }}"),
  'Minnesota OHV workflow environment should fall back to statewide sync scope',
);
assert(
  workflow.includes('sync_scope = os.environ.get("SYNC_SCOPE", "statewide").strip().lower()'),
  'Minnesota OHV GeoPackage converter should default to statewide sync scope',
);
assert(workflow.includes('default_max_features = 1000 if sync_scope == "statewide" else 250'), 'Minnesota OHV workflow should keep pilot bounded while allowing statewide backfill');
assert(workflow.includes('"syncScope": sync_scope'), 'Minnesota OHV workflow payload should preserve selected sync scope');
assert(workflow.includes('Sync scope:'), 'Minnesota OHV workflow summary should show selected sync scope');

console.log('Minnesota DNR OHV route catalog adapter checks passed');

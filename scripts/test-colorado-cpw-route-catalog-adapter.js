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
  COLORADO_CPW_DESIGNATED_TRAILS_SOURCE,
  COLORADO_CPW_DESIGNATED_TRAILS_QUERY,
  coloradoCpwDesignatedTrailsSourceUpsert,
  featureToColoradoCpwDesignatedTrailRouteUpsert,
  normalizeColoradoCpwDesignatedTrailFeatureCollection,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogColoradoCpwDesignatedTrails.ts'));

assert.strictEqual(COLORADO_CPW_DESIGNATED_TRAILS_SOURCE.providerId, 'colorado_cpw_designated_trails');
assert(
  COLORADO_CPW_DESIGNATED_TRAILS_SOURCE.sourceUri.includes('CPWDesignatedTrails02172021/FeatureServer/0'),
  'Colorado CPW adapter should point at the official designated trails FeatureServer layer',
);
assert(
  COLORADO_CPW_DESIGNATED_TRAILS_QUERY.where.includes('motorcycle') &&
    COLORADO_CPW_DESIGNATED_TRAILS_QUERY.where.includes('atv') &&
    COLORADO_CPW_DESIGNATED_TRAILS_QUERY.where.includes('ohv_gt_50') &&
    COLORADO_CPW_DESIGNATED_TRAILS_QUERY.where.includes('highway_ve'),
  'Colorado CPW sync query should only request motorized-permitted candidate trails',
);
assert(
  COLORADO_CPW_DESIGNATED_TRAILS_QUERY.where.includes('seasonally') &&
    COLORADO_CPW_DESIGNATED_TRAILS_QUERY.where.includes("LIKE '%/%'"),
  'Colorado CPW sync query should include official seasonal and date-window motorized candidates with visible caveats',
);

const sourceUpsert = coloradoCpwDesignatedTrailsSourceUpsert('2026-06-02T12:00:00.000Z');
assert.strictEqual(sourceUpsert.source_type, 'state_agency');
assert.strictEqual(sourceUpsert.authority, 'official_access');
assert(sourceUpsert.attribution.includes('Colorado Parks & Wildlife'));

const motorizedFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 83,
      properties: {
        FID: 83,
        name: 'Bull Mountain Road',
        surface: 'Natural Surface',
        motorcycle: 'Yes',
        atv: 'Yes',
        ohv_gt_50: 'Yes',
        highway_ve: 'yes',
        Snowmobile: 'Groomed',
        length_mi_: 3.9,
        manager: 'State Forest State Park',
        PropName: 'State Forest State Park',
        PropType: 'SP',
        TrailGUID: 'cpw-bull-mountain-road',
        EDIT_DATE: 1577664000000,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-105.953101, 40.543042],
          [-105.952899, 40.542917],
          [-105.952375, 40.542651],
          [-105.952268, 40.542571],
        ],
      },
    },
  ],
};

const features = normalizeColoradoCpwDesignatedTrailFeatureCollection(motorizedFeatureCollection);
assert.strictEqual(features.length, 1, 'Colorado CPW adapter should normalize GeoJSON FeatureCollections');

const upsert = featureToColoradoCpwDesignatedTrailRouteUpsert(features[0], {
  sourceId: 'source-colorado-cpw',
  sourceLastVerifiedAt: '2026-06-02T12:00:00.000Z',
  ingestRunId: 'ingest-colorado-cpw',
  minMiles: 0.25,
});

assert(upsert, 'Colorado CPW motorized designated trail should produce a public route-catalog recommendation record');
assert.strictEqual(upsert.verifiedRoute.public_id, 'colorado-cpw-designated-trail-bull-mountain-road-feature-83');
assert.strictEqual(upsert.verifiedRoute.recommendation_status, 'recommendable');
assert.strictEqual(upsert.verifiedRoute.verification_status, 'official_verified');
assert.deepStrictEqual(upsert.verifiedRoute.vehicle_fit, ['full_size_4x4', 'atv', 'utv', 'motorcycle']);
assert.strictEqual(upsert.verifiedRoute.official_access_coverage_pct, 84);
assert.strictEqual(upsert.verifiedRoute.unknown_access_coverage_pct, 16);
assert(upsert.verifiedRoute.confidence_score >= 80 && upsert.verifiedRoute.confidence_score < 88);
assert(
  upsert.verifiedRoute.warning_reasons.some((reason) => /closures, permits, trail signage/i.test(reason)),
  'Colorado CPW recommendations must carry current-condition warnings',
);
assert.strictEqual(upsert.verifiedRoute.route_intelligence.sourceAdapter, 'colorado_cpw_designated_trails');
assert.strictEqual(upsert.verifiedRoute.community_signal.sourceAdapter, 'colorado_cpw_designated_trails');
assert.strictEqual(upsert.verifiedRouteSource.coverage_pct, 84);
assert.strictEqual(upsert.verifiedRouteSource.metadata.providerFeatureId, 'colorado-cpw-designated-trails:83');
assert.strictEqual(upsert.rawSourceFeature.provider_feature_id, 'colorado-cpw-designated-trails:83');
assert(upsert.rawSourceFeature.properties.geometry, 'Raw source feature should preserve normalized geometry for auditability');

const seasonalMotorized = featureToColoradoCpwDesignatedTrailRouteUpsert({
  ...features[0],
  id: 710,
  properties: {
    ...features[0].properties,
    FID: 710,
    name: 'Old Fulford Road',
    motorcycle: '05/21-11/22',
    atv: '05/21-11/22',
    ohv_gt_50: '05/21-11/22',
    highway_ve: 'seasonally',
    length_mi_: 0.98,
    manager: 'USFS Eagle-Holy Cross Ranger District',
    PropName: 'USFS Eagle-Holy Cross Ranger District',
    access: 'seasonally',
  },
}, {
  sourceId: 'source-colorado-cpw',
  sourceLastVerifiedAt: '2026-06-02T12:00:00.000Z',
  ingestRunId: 'ingest-colorado-cpw',
  minMiles: 0.25,
});
assert(seasonalMotorized, 'Colorado CPW seasonal/date-window motorized trail should produce a conditional public recommendation record');
assert.deepStrictEqual(seasonalMotorized.verifiedRoute.vehicle_fit, ['full_size_4x4', 'atv', 'utv', 'motorcycle']);
assert.strictEqual(seasonalMotorized.verifiedRoute.seasonal_restriction_count, 1);
assert(
  seasonalMotorized.verifiedRoute.warning_reasons.some((reason) => /seasonal|date-window|trip-date/i.test(reason)),
  'Colorado CPW seasonal recommendations must carry explicit seasonal/date-window warnings',
);
assert(
  seasonalMotorized.verifiedRoute.route_intelligence.conditionalUseValues.some((value) => value.includes('05/21-11/22')),
  'Colorado CPW route intelligence should preserve official seasonal/date-window values',
);

const nonMotorized = featureToColoradoCpwDesignatedTrailRouteUpsert({
  ...features[0],
  properties: {
    ...features[0].properties,
    FID: 84,
    name: 'Hiking Only Trail',
    motorcycle: 'no',
    atv: 'no',
    ohv_gt_50: 'no',
    highway_ve: 'no',
  },
}, {
  sourceId: 'source-colorado-cpw',
  sourceLastVerifiedAt: '2026-06-02T12:00:00.000Z',
  ingestRunId: 'ingest-colorado-cpw',
  minMiles: 0.25,
});
assert.strictEqual(nonMotorized, null, 'Colorado CPW non-motorized trails must not become public recommendations');

const tooShort = featureToColoradoCpwDesignatedTrailRouteUpsert({
  ...features[0],
  properties: {
    ...features[0].properties,
    FID: 85,
    name: 'Tiny Connector',
    length_mi_: 0.1,
  },
}, {
  sourceId: 'source-colorado-cpw',
  sourceLastVerifiedAt: '2026-06-02T12:00:00.000Z',
  ingestRunId: 'ingest-colorado-cpw',
  minMiles: 0.25,
});
assert.strictEqual(tooShort, null, 'Colorado CPW adapter should drop routes below the configured minimum miles');

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-colorado-cpw-trails', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'Colorado CPW designated trails sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'Colorado CPW sync should require the server-side route catalog sync token');
assert(syncFunction.includes('COLORADO_CPW_DESIGNATED_TRAILS_QUERY'), 'Colorado CPW sync should use the bounded official motorized-use query');
assert(syncFunction.includes('countPublicRecommendations(routeRows)'), 'Colorado CPW sync should report public recommendation telemetry');

const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-colorado-cpw-trails-sync.yml');
assert(fs.existsSync(workflowPath), 'Colorado CPW designated trails sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert(workflow.includes('Route Catalog Colorado CPW Trails Sync'), 'Colorado CPW sync workflow should have an operator-visible name');
assert(workflow.includes('--write-out "%{http_code}"'), 'Colorado CPW sync workflow should preserve response bodies on HTTP errors');
assert(workflow.includes('route-catalog-colorado-cpw-trails-sync-response.json'), 'Colorado CPW sync workflow should print sanitized failed sync responses');

console.log('Colorado CPW designated trails route catalog adapter checks passed');

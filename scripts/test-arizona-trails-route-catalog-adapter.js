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
  ARIZONA_STATE_PARKS_TRAILS_QUERY,
  ARIZONA_STATE_PARKS_TRAILS_SOURCE,
  arizonaStateParksTrailsSourceUpsert,
  featureToArizonaStateParksTrailRouteUpsert,
  normalizeArizonaStateParksTrailFeatureCollection,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogArizonaStateParksTrails.ts'));

assert.strictEqual(ARIZONA_STATE_PARKS_TRAILS_SOURCE.providerId, 'arizona_state_parks_trails');
assert(
  ARIZONA_STATE_PARKS_TRAILS_SOURCE.sourceUri.includes('AZSPTrails/FeatureServer/3'),
  'Arizona trails adapter should point at the official Arizona State Parks and Trails FeatureServer layer',
);
assert(
  ARIZONA_STATE_PARKS_TRAILS_QUERY.where.includes("Motorized = 'Y'") &&
    ARIZONA_STATE_PARKS_TRAILS_QUERY.where.includes("Status IN ('Verified','Open','Road')"),
  'Arizona trails sync query should only request open/verified/road motorized candidates',
);

const sourceUpsert = arizonaStateParksTrailsSourceUpsert('2026-06-04T12:00:00.000Z');
assert.strictEqual(sourceUpsert.provider_id, 'arizona_state_parks_trails');
assert.strictEqual(sourceUpsert.source_type, 'state_agency');
assert.strictEqual(sourceUpsert.authority, 'official_access');
assert(sourceUpsert.attribution.includes('Arizona State Parks and Trails'));

const motorizedPayload = {
  features: [
    {
      attributes: {
        FID: 1229,
        TrailName: 'Monument Peak Trail',
        TrailID: ' ',
        Status: 'Open',
        Miles: 3.03237423793,
        Jurisdicti: 'Town of Star Valley',
        Manager: 'Town of Star Valley',
        ManagUnit: ' ',
        County: 'Gila',
        System: 'N',
        Surface: 'Unpaved',
        Type: ' ',
        Motorized: 'Y',
        Motorcycle: ' ',
        ATV: ' ',
        UTV: ' ',
        StreetVehi: ' ',
        Snowmobile: 'N',
        Seasonal: 'N',
        Permit_Gui: 'N',
        PrimeUse: ' ',
        Source: 'Town of Payson PATS dataset',
        Website: 'http://www.paysonaz.gov/Departments/RecreationTourism/Trails.html',
        Verified: ' ',
        Shape__Length: 4880.143812751606,
      },
      geometry: {
        paths: [
          [
            [-111.263438, 34.232553],
            [-111.263248, 34.233223],
            [-111.25912, 34.239098],
            [-111.255796, 34.244238],
            [-111.263666, 34.244381],
            [-111.272374, 34.242098],
            [-111.263553, 34.232744],
          ],
        ],
      },
    },
  ],
};

const features = normalizeArizonaStateParksTrailFeatureCollection(motorizedPayload);
assert.strictEqual(features.length, 1, 'Arizona adapter should normalize ArcGIS JSON feature payloads');

const upsert = featureToArizonaStateParksTrailRouteUpsert(features[0], {
  sourceId: 'source-arizona-trails',
  sourceLastVerifiedAt: '2026-06-04T12:00:00.000Z',
  ingestRunId: 'ingest-arizona-trails',
  minMiles: 0.25,
});
assert(upsert, 'Arizona open motorized trail/pathway record should produce a public route-catalog recommendation record');
assert.strictEqual(upsert.verifiedRoute.public_id, 'arizona-state-parks-trail-monument-peak-trail-feature-1229');
assert.strictEqual(upsert.verifiedRoute.recommendation_status, 'recommendable');
assert.strictEqual(upsert.verifiedRoute.verification_status, 'official_verified');
assert.deepStrictEqual(upsert.verifiedRoute.vehicle_fit, ['full_size_4x4', 'atv', 'utv', 'motorcycle']);
assert.strictEqual(upsert.verifiedRoute.official_access_coverage_pct, 74);
assert.strictEqual(upsert.verifiedRoute.unknown_access_coverage_pct, 26);
assert(upsert.verifiedRoute.confidence_score >= 72 && upsert.verifiedRoute.confidence_score < 84);
assert(
  upsert.verifiedRoute.warning_reasons.some((reason) => /current closures, permits, trail signage/i.test(reason)),
  'Arizona recommendations must carry current-condition and signage warnings',
);
assert(
  upsert.verifiedRoute.warning_reasons.some((reason) => /statewide trails dataset/i.test(reason)),
  'Arizona recommendations must warn that the statewide trails layer is not a local closure authority',
);
assert.strictEqual(upsert.verifiedRoute.route_intelligence.sourceAdapter, 'arizona_state_parks_trails');
assert.strictEqual(upsert.verifiedRoute.community_signal.sourceAdapter, 'arizona_state_parks_trails');
assert.strictEqual(upsert.verifiedRouteSource.coverage_pct, 74);
assert.strictEqual(upsert.verifiedRouteSource.metadata.providerFeatureId, 'arizona-state-parks-trails:1229');
assert.strictEqual(upsert.rawSourceFeature.provider_feature_id, 'arizona-state-parks-trails:1229');
assert(upsert.rawSourceFeature.properties.geometry, 'Raw source feature should preserve normalized geometry for auditability');

const closedFeature = featureToArizonaStateParksTrailRouteUpsert({
  ...features[0],
  attributes: {
    ...features[0].attributes,
    FID: 1232,
    Status: 'Closed',
  },
}, {
  sourceId: 'source-arizona-trails',
  sourceLastVerifiedAt: '2026-06-04T12:00:00.000Z',
  ingestRunId: 'ingest-arizona-trails',
  minMiles: 0.25,
});
assert.strictEqual(closedFeature, null, 'Arizona closed trail records must not become public recommendations');

const nonMotorized = featureToArizonaStateParksTrailRouteUpsert({
  ...features[0],
  attributes: {
    ...features[0].attributes,
    FID: 1233,
    Motorized: 'N',
    Motorcycle: 'N',
    ATV: 'N',
    UTV: 'N',
  },
}, {
  sourceId: 'source-arizona-trails',
  sourceLastVerifiedAt: '2026-06-04T12:00:00.000Z',
  ingestRunId: 'ingest-arizona-trails',
  minMiles: 0.25,
});
assert.strictEqual(nonMotorized, null, 'Arizona non-motorized trails must not become public recommendations');

const tooShort = featureToArizonaStateParksTrailRouteUpsert({
  ...features[0],
  attributes: {
    ...features[0].attributes,
    FID: 1234,
    Miles: 0.12,
    Shape__Length: 193.121,
  },
}, {
  sourceId: 'source-arizona-trails',
  sourceLastVerifiedAt: '2026-06-04T12:00:00.000Z',
  ingestRunId: 'ingest-arizona-trails',
  minMiles: 0.25,
});
assert.strictEqual(tooShort, null, 'Arizona adapter should drop records below the configured minimum miles');

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-arizona-trails', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'Arizona trails sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'Arizona trails sync should require the server-side route catalog sync token');
assert(syncFunction.includes('ARIZONA_STATE_PARKS_TRAILS_QUERY'), 'Arizona trails sync should use the bounded official motorized-use query');
assert(syncFunction.includes('countPublicRecommendations(routeRows)'), 'Arizona trails sync should report public recommendation telemetry');

const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-arizona-trails-sync.yml');
assert(fs.existsSync(workflowPath), 'Arizona trails sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert(workflow.includes('Route Catalog Arizona Trails Sync'), 'Arizona trails sync workflow should have an operator-visible name');
assert(workflow.includes('--write-out "%{http_code}"'), 'Arizona trails sync workflow should preserve response bodies on HTTP errors');
assert(workflow.includes('route-catalog-arizona-trails-sync-response.json'), 'Arizona trails sync workflow should print sanitized failed sync responses');

console.log('Arizona trails route catalog adapter checks passed');

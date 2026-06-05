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
  UTAH_TRAILS_SOURCE,
  UTAH_TRAILS_QUERY,
  featureToUtahTrailRouteUpsert,
  normalizeUtahTrailFeatureCollection,
  utahTrailsSourceUpsert,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogUtahTrails.ts'));

assert.strictEqual(UTAH_TRAILS_SOURCE.providerId, 'utah_sgid_trails');
assert(
  UTAH_TRAILS_SOURCE.sourceUri.includes('Trails_and_Pathways_in_Utah/FeatureServer/0'),
  'Utah trail adapter should point at the official Utah AGRC trails/pathways FeatureServer layer',
);
assert(
  UTAH_TRAILS_QUERY.where.includes('MotorizedA') &&
    UTAH_TRAILS_QUERY.where.includes('Yes') &&
    UTAH_TRAILS_QUERY.where.includes("Status = 'EXISTING'"),
  'Utah trail sync query should only request existing motorized-allowed candidates',
);

const sourceUpsert = utahTrailsSourceUpsert('2026-06-04T12:00:00.000Z');
assert.strictEqual(sourceUpsert.provider_id, 'utah_sgid_trails');
assert.strictEqual(sourceUpsert.source_type, 'state_agency');
assert.strictEqual(sourceUpsert.authority, 'official_access');
assert(sourceUpsert.attribution.includes('Utah AGRC'));

const motorizedPayload = {
  features: [
    {
      attributes: {
        FID: 23,
        PrimaryNam: 'Lockhart Basin Road',
        ID: 'OV485527',
        Status: 'EXISTING',
        Designated: 'Multiuse',
        SurfaceTyp: 'Unpaved',
        Class: 'Trail',
        CartoCode: '4 - Road-concurrent',
        MotorizedA: 'Yes',
        County: 'SAN JUAN',
        OwnerStewa: 'BLM',
        TransNetwo: 'Road only',
        Comments: 'OVAccessPUBLIC|OVRdMaintLvl2',
        DataSource: 'OrbitalView',
        Unique_ID: '{2d23b98b-ae13-48c8-a9cf-908c0fa7b0b7}',
        last_edi_1: 1763967600000,
        Shape__Length: 6437.376,
      },
      geometry: {
        paths: [
          [
            [-110.139233, 36.992592],
            [-110.135976, 36.995973],
            [-110.129887, 36.999177],
          ],
        ],
      },
    },
  ],
};

const features = normalizeUtahTrailFeatureCollection(motorizedPayload);
assert.strictEqual(features.length, 1, 'Utah adapter should normalize ArcGIS JSON feature payloads');

const upsert = featureToUtahTrailRouteUpsert(features[0], {
  sourceId: 'source-utah-trails',
  sourceLastVerifiedAt: '2026-06-04T12:00:00.000Z',
  ingestRunId: 'ingest-utah-trails',
  minMiles: 0.25,
});
assert(upsert, 'Utah motorized-allowed trail/pathway record should produce a public route-catalog recommendation record');
assert.strictEqual(upsert.verifiedRoute.public_id, 'utah-sgid-trail-lockhart-basin-road-feature-23');
assert.strictEqual(upsert.verifiedRoute.recommendation_status, 'recommendable');
assert.strictEqual(upsert.verifiedRoute.verification_status, 'official_verified');
assert.deepStrictEqual(upsert.verifiedRoute.vehicle_fit, ['full_size_4x4', 'atv', 'utv', 'motorcycle']);
assert.strictEqual(upsert.verifiedRoute.official_access_coverage_pct, 78);
assert.strictEqual(upsert.verifiedRoute.unknown_access_coverage_pct, 22);
assert(upsert.verifiedRoute.confidence_score >= 76 && upsert.verifiedRoute.confidence_score < 86);
assert(
  upsert.verifiedRoute.warning_reasons.some((reason) => /current closures, permits, trail signage/i.test(reason)),
  'Utah recommendations must carry current-condition and signage warnings',
);
assert(
  upsert.verifiedRoute.warning_reasons.some((reason) => /statewide trail inventory/i.test(reason)),
  'Utah recommendations must warn that the statewide trails layer is not a local closure authority',
);
assert.strictEqual(upsert.verifiedRoute.route_intelligence.sourceAdapter, 'utah_sgid_trails');
assert.strictEqual(upsert.verifiedRoute.community_signal.sourceAdapter, 'utah_sgid_trails');
assert.strictEqual(upsert.verifiedRouteSource.coverage_pct, 78);
assert.strictEqual(upsert.verifiedRouteSource.metadata.providerFeatureId, 'utah-sgid-trails:23');
assert.strictEqual(upsert.rawSourceFeature.provider_feature_id, 'utah-sgid-trails:23');
assert(upsert.rawSourceFeature.properties.geometry, 'Raw source feature should preserve normalized geometry for auditability');

const closedFeature = featureToUtahTrailRouteUpsert({
  ...features[0],
  attributes: {
    ...features[0].attributes,
    FID: 24,
    Status: 'CLOSED',
  },
}, {
  sourceId: 'source-utah-trails',
  sourceLastVerifiedAt: '2026-06-04T12:00:00.000Z',
  ingestRunId: 'ingest-utah-trails',
  minMiles: 0.25,
});
assert.strictEqual(closedFeature, null, 'Utah closed trail records must not become public recommendations');

const nonMotorized = featureToUtahTrailRouteUpsert({
  ...features[0],
  attributes: {
    ...features[0].attributes,
    FID: 25,
    MotorizedA: 'No',
  },
}, {
  sourceId: 'source-utah-trails',
  sourceLastVerifiedAt: '2026-06-04T12:00:00.000Z',
  ingestRunId: 'ingest-utah-trails',
  minMiles: 0.25,
});
assert.strictEqual(nonMotorized, null, 'Utah non-motorized trails must not become public recommendations');

const tooShort = featureToUtahTrailRouteUpsert({
  ...features[0],
  attributes: {
    ...features[0].attributes,
    FID: 26,
    Shape__Length: 80,
  },
}, {
  sourceId: 'source-utah-trails',
  sourceLastVerifiedAt: '2026-06-04T12:00:00.000Z',
  ingestRunId: 'ingest-utah-trails',
  minMiles: 0.25,
});
assert.strictEqual(tooShort, null, 'Utah adapter should drop records below the configured minimum miles');

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-utah-trails', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'Utah trails sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'Utah trails sync should require the server-side route catalog sync token');
assert(syncFunction.includes('UTAH_TRAILS_QUERY'), 'Utah trails sync should use the bounded official motorized-use query');
assert(syncFunction.includes('countPublicRecommendations(routeRows)'), 'Utah trails sync should report public recommendation telemetry');

const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-utah-trails-sync.yml');
assert(fs.existsSync(workflowPath), 'Utah trails sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert(workflow.includes('Route Catalog Utah Trails Sync'), 'Utah trails sync workflow should have an operator-visible name');
assert(workflow.includes('--write-out "%{http_code}"'), 'Utah trails sync workflow should preserve response bodies on HTTP errors');
assert(workflow.includes('route-catalog-utah-trails-sync-response.json'), 'Utah trails sync workflow should print sanitized failed sync responses');

console.log('Utah trails route catalog adapter checks passed');

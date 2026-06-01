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
  USGS_TRAILS_LAYER,
  USGS_TRAILS_SOURCE,
  arcGisFeatureToUsgsTrailsRouteUpsert,
  buildUsgsTrailsWhereClause,
  normalizeUsgsTrailsFeatureCollection,
  usgsTrailsSourceUpsert,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogUsgsTrails.ts'));

assert.strictEqual(USGS_TRAILS_SOURCE.providerId, 'usgs_digital_trails');
assert.strictEqual(USGS_TRAILS_LAYER.id, 37);
assert(USGS_TRAILS_LAYER.url.includes('carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/37'));

const where = buildUsgsTrailsWhereClause({ minMiles: 1 });
assert(where.includes("trailtype = 'Terra Trail'"));
assert(where.includes("motorcycle = 'Y'"));
assert(where.includes("ohvover50inches = 'Y'"));
assert(where.includes("ohvisorunder50inches = 'Y'"));
assert(where.includes('lengthmiles >= 1'));

const sourceUpsert = usgsTrailsSourceUpsert('2026-06-01T00:00:00.000Z');
assert.strictEqual(sourceUpsert.provider_id, 'usgs_digital_trails');
assert.strictEqual(sourceUpsert.authority, 'supplemental_geometry');
assert.strictEqual(sourceUpsert.source_type, 'federal_agency');

const motorizedTrail = {
  attributes: {
    objectid: 1475189,
    name: 'Calf Creek West',
    trailnumber: '724',
    permanentidentifier: 'fc5fe678-232d-44aa-ba9a-4d07be38a8ae',
    sourcefeatureid: '5387.000851',
    sourcedatasetid: '{FCB8819D-5F52-4371-91AC-879EB080369D}',
    sourceoriginator: 'U.S. Forest Service',
    trailtype: 'Terra Trail',
    motorcycle: 'Y',
    ohvover50inches: 'N',
    ohvisorunder50inches: 'N',
    osvm: null,
    primarytrailmaintainer: 'FS',
    nationaltraildesignation: null,
    lengthmiles: 1.33995263,
    networklength: 15.762503,
    globalid: '{E24CB5A1-40F6-4DB5-8A08-573CB790122D}',
  },
  geometry: {
    paths: [
      [
        [-110.963152, 46.841947],
        [-110.962915, 46.842061],
        [-110.962685, 46.842232],
      ],
    ],
  },
};

const motorizedUpsert = arcGisFeatureToUsgsTrailsRouteUpsert(motorizedTrail, {
  sourceId: '00000000-0000-0000-0000-000000000020',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 1,
});

assert(motorizedUpsert, 'A USGS Trails motorized terra trail with geometry should produce supplemental source geometry');
assert.strictEqual(motorizedUpsert.verifiedRoute.public_id, 'usgs-trails-fs-trail-724-calf-creek-west-feature-1475189');
assert.strictEqual(motorizedUpsert.verifiedRoute.name, 'USGS Trail 724 Calf Creek West');
assert.strictEqual(motorizedUpsert.verifiedRoute.recommendation_status, 'not_recommended');
assert.strictEqual(motorizedUpsert.verifiedRoute.verification_status, 'geometry_only');
assert.strictEqual(motorizedUpsert.verifiedRoute.review_status, 'approved');
assert.strictEqual(motorizedUpsert.verifiedRoute.official_access_coverage_pct, 0);
assert.strictEqual(motorizedUpsert.verifiedRoute.unknown_access_coverage_pct, 100);
assert.deepStrictEqual(motorizedUpsert.verifiedRoute.vehicle_fit, ['motorcycle']);
assert(
  motorizedUpsert.verifiedRoute.warning_reasons.some((warning) => /supplemental geometry/i.test(warning)),
  'USGS Trails records must be labeled as supplemental geometry, not legal authority',
);
assert(
  motorizedUpsert.verifiedRoute.blocker_reasons.some((blocker) => /does not establish legal motorized access/i.test(blocker)),
  'USGS Trails records should hard-block public recommendation without authoritative access overlay',
);
assert.strictEqual(motorizedUpsert.rawSourceFeature.provider_feature_id, 'usgs-trails:1475189');
assert.strictEqual(motorizedUpsert.verifiedRouteSource.source_role, 'supplemental');

const fullSizeTrail = arcGisFeatureToUsgsTrailsRouteUpsert(
  {
    attributes: {
      objectid: 42,
      name: 'Wide OHV Connector',
      trailtype: 'Terra Trail',
      motorcycle: 'N',
      ohvover50inches: 'Y',
      ohvisorunder50inches: 'Y',
      lengthmiles: 2,
      sourceoriginator: 'Bureau of Land Management',
      primarytrailmaintainer: 'BLM',
    },
    geometry: { paths: [[[-120.65, 42.99], [-120.66, 43.0]]] },
  },
  {
    sourceId: '00000000-0000-0000-0000-000000000020',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  },
);
assert(fullSizeTrail, 'USGS OHV >50 inch records should normalize as full-size supplemental geometry');
assert.deepStrictEqual(fullSizeTrail.verifiedRoute.vehicle_fit, ['full_size_4x4', 'atv', 'utv']);

assert.strictEqual(
  arcGisFeatureToUsgsTrailsRouteUpsert(
    {
      attributes: {
        objectid: 100,
        name: 'Hiking Only',
        trailtype: 'Terra Trail',
        motorcycle: 'N',
        ohvover50inches: 'N',
        ohvisorunder50inches: 'N',
        lengthmiles: 2,
      },
      geometry: { paths: [[[-120, 39], [-120.01, 39.01]]] },
    },
    {
      sourceId: 'source',
      sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
      minMiles: 1,
    },
  ),
  null,
  'Non-motorized USGS Trails records should not enter the overland route catalog adapter',
);

const normalized = normalizeUsgsTrailsFeatureCollection({ features: [motorizedTrail] });
assert.strictEqual(normalized.length, 1);
assert.strictEqual(normalized[0].attributes.trailtype, 'Terra Trail');

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-usgs-trails', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'USGS Trails sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'USGS Trails sync should require the server-side route catalog sync token');
assert(syncFunction.includes('route_sources') && syncFunction.includes('verified_routes'));
assert(syncFunction.includes('bbox'), 'USGS Trails sync should require bounded spatial sync input');
assert(syncFunction.includes('publicRecommendationCount: 0'), 'USGS Trails sync should report zero public recommendations for supplemental geometry');

console.log('USGS Trails route catalog adapter checks passed');

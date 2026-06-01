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
  NPS_PUBLIC_TRAILS_LAYER,
  NPS_PUBLIC_TRAILS_SOURCE,
  arcGisFeatureToNpsPublicTrailsRouteUpsert,
  buildNpsPublicTrailsWhereClause,
  normalizeNpsPublicTrailsFeatureCollection,
  npsPublicTrailsSourceUpsert,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogNpsPublicTrails.ts'));

assert.strictEqual(NPS_PUBLIC_TRAILS_SOURCE.providerId, 'nps_public_trails');
assert.strictEqual(NPS_PUBLIC_TRAILS_LAYER.id, 0);
assert(
  NPS_PUBLIC_TRAILS_LAYER.url.includes('mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0'),
);

const where = buildNpsPublicTrailsWhereClause();
assert(where.includes("PUBLICDISPLAY = 'Public Map Display'"));
assert(where.includes("DATAACCESS = 'Unrestricted'"));
assert(where.includes("TRLSTATUS in ('Existing','Open')"));
assert(where.includes("TRLTYPE LIKE '%Terra%'"));
assert(where.includes("TRLUSE LIKE '%Four-Wheel Drive%'"));
assert(where.includes("TRLUSE LIKE '%All-Terrain Vehicle%'"));
assert(where.includes("TRLUSE LIKE '%Motorcycle%'"));
assert(where.includes("TRLUSE LIKE '%Motorized%'"));

const sourceUpsert = npsPublicTrailsSourceUpsert('2026-06-01T00:00:00.000Z');
assert.strictEqual(sourceUpsert.provider_id, 'nps_public_trails');
assert.strictEqual(sourceUpsert.source_type, 'federal_agency');
assert.strictEqual(sourceUpsert.authority, 'official_park_trail_context');

const fourWheelDriveTrail = {
  attributes: {
    OBJECTID: 10785,
    TRLNAME: 'Knob Mtn Trail',
    TRLSTATUS: 'Existing',
    TRLTYPE: 'Standard Terra Trail',
    TRLUSE: 'Four-Wheel Drive Vehicle > 50” in Tread Width',
    PUBLICDISPLAY: 'Public Map Display',
    DATAACCESS: 'Unrestricted',
    OPENTOPUBLIC: null,
    UNITCODE: 'SHEN',
    UNITNAME: 'Shenandoah National Park',
    SEASONAL: 'No',
    SEASDESC: null,
    FEATUREID: 'nps-feature-10785',
  },
  geometry: {
    paths: [
      [
        [-78.6762, 38.7321],
        [-78.671, 38.7352],
        [-78.6654, 38.7386],
      ],
    ],
  },
};

const fourWheelDriveUpsert = arcGisFeatureToNpsPublicTrailsRouteUpsert(fourWheelDriveTrail, {
  sourceId: '00000000-0000-0000-0000-000000000030',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 0.1,
});

assert(fourWheelDriveUpsert, 'A public NPS terra trail with motorized-use text and geometry should produce a curation record');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.public_id, 'nps-public-trails-shen-knob-mtn-trail-feature-10785');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.name, 'NPS Trail Knob Mtn Trail - Shenandoah National Park');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.recommendation_status, 'not_recommended');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.verification_status, 'partially_verified');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.review_status, 'approved');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.official_access_coverage_pct, 60);
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.unknown_access_coverage_pct, 40);
assert.deepStrictEqual(fourWheelDriveUpsert.verifiedRoute.vehicle_fit, ['full_size_4x4']);
assert(fourWheelDriveUpsert.verifiedRoute.distance_miles > 0.1);
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.route_geometry.type, 'LineString');
assert(
  fourWheelDriveUpsert.verifiedRoute.warning_reasons.some((warning) => /park unit rules and current alerts/i.test(warning)),
  'NPS records must retain the park-unit/current-alert verification caveat',
);
assert(
  fourWheelDriveUpsert.verifiedRoute.blocker_reasons.some((blocker) => /not yet reviewed with park unit legal access/i.test(blocker)),
  'NPS public trail records should not become public recommendations before legal/current-condition review',
);
assert.strictEqual(fourWheelDriveUpsert.rawSourceFeature.provider_feature_id, 'nps-public-trails:10785');
assert.strictEqual(fourWheelDriveUpsert.verifiedRouteSource.source_role, 'primary');

const mixedMotorizedTrail = arcGisFeatureToNpsPublicTrailsRouteUpsert(
  {
    attributes: {
      OBJECTID: 51,
      TRLNAME: 'Backcountry Connector',
      TRLSTATUS: 'Open',
      TRLTYPE: 'Standard Terra Trail',
      TRLUSE: 'ATV | Bike | Hike | Motorcycle | Snowmobile',
      PUBLICDISPLAY: 'Public Map Display',
      DATAACCESS: 'Unrestricted',
      UNITCODE: 'TEST',
      UNITNAME: 'Test National Recreation Area',
      SEASONAL: 'Yes',
      SEASDESC: 'Winter use only.',
    },
    geometry: { paths: [[[-110, 43], [-110.01, 43.02], [-110.02, 43.04]]] },
  },
  {
    sourceId: '00000000-0000-0000-0000-000000000030',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 0.1,
  },
);
assert(mixedMotorizedTrail, 'NPS mixed motorized trail-use values should normalize into vehicle fit');
assert.deepStrictEqual(mixedMotorizedTrail.verifiedRoute.vehicle_fit, ['atv', 'utv', 'motorcycle', 'snowmobile']);
assert.strictEqual(mixedMotorizedTrail.verifiedRoute.seasonal_restriction_count, 1);
assert(
  mixedMotorizedTrail.verifiedRoute.warning_reasons.some((warning) => /Winter use only/i.test(warning)),
  'NPS seasonal descriptions should surface as warnings',
);

assert.strictEqual(
  arcGisFeatureToNpsPublicTrailsRouteUpsert(
    {
      attributes: {
        OBJECTID: 100,
        TRLNAME: 'Hiking Only',
        TRLSTATUS: 'Existing',
        TRLTYPE: 'Standard Terra Trail',
        TRLUSE: 'Hike | Bike',
        PUBLICDISPLAY: 'Public Map Display',
        DATAACCESS: 'Unrestricted',
      },
      geometry: { paths: [[[-120, 39], [-120.01, 39.01]]] },
    },
    {
      sourceId: 'source',
      sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
      minMiles: 0.1,
    },
  ),
  null,
  'Non-motorized NPS public trail records should not enter the overland route catalog adapter',
);

const normalized = normalizeNpsPublicTrailsFeatureCollection({ features: [fourWheelDriveTrail] });
assert.strictEqual(normalized.length, 1);
assert.strictEqual(normalized[0].attributes.UNITCODE, 'SHEN');

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-nps-trails', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'NPS public trails sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'NPS Trails sync should require the server-side route catalog sync token');
assert(syncFunction.includes('route_sources') && syncFunction.includes('verified_routes'));
assert(syncFunction.includes('bbox'), 'NPS Trails sync should require bounded spatial sync input');
assert(syncFunction.includes('publicRecommendationCount: 0'), 'NPS Trails sync should report zero public recommendations for context-only ingestion');

console.log('NPS public trails route catalog adapter checks passed');

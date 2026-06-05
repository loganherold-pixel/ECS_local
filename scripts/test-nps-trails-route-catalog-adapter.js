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
  normalizeNpsPublicTrailsBboxes,
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
assert(where.includes("TRLUSE NOT LIKE '%Non-Motorized%'"), 'NPS query should not treat literal Non-Motorized trail-use records as motorized');

const normalizedBboxes = normalizeNpsPublicTrailsBboxes([
  { key: 'joshua_tree', label: 'Joshua Tree National Park', xmin: -116.3066, ymin: 33.7377, xmax: -115.7726, ymax: 34.2586 },
  { key: 'big_south_fork', label: 'Big South Fork NRRA', west: -85.044, south: 36.2043, east: -84.2655, north: 36.9675 },
]);
assert.strictEqual(normalizedBboxes.length, 2);
assert.strictEqual(normalizedBboxes[0].key, 'joshua_tree');
assert.strictEqual(normalizedBboxes[1].bbox.xmin, -85.044);
assert.strictEqual(normalizeNpsPublicTrailsBboxes(null), null);

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

assert(fourWheelDriveUpsert, 'A public NPS terra trail with motorized-use text and geometry should produce a public route-catalog recommendation record');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.public_id, 'nps-public-trails-shen-knob-mtn-trail-feature-10785');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.name, 'NPS Trail Knob Mtn Trail - Shenandoah National Park');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.recommendation_status, 'recommendable');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.verification_status, 'official_verified');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.review_status, 'approved');
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.official_access_coverage_pct, 80);
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.unknown_access_coverage_pct, 20);
assert.deepStrictEqual(fourWheelDriveUpsert.verifiedRoute.vehicle_fit, ['full_size_4x4']);
assert(fourWheelDriveUpsert.verifiedRoute.distance_miles > 0.1);
assert.strictEqual(fourWheelDriveUpsert.verifiedRoute.route_geometry.type, 'LineString');
assert(
  fourWheelDriveUpsert.verifiedRoute.warning_reasons.some((warning) => /park unit rules and current alerts/i.test(warning)),
  'NPS records must retain the park-unit/current-alert verification caveat',
);
assert.deepStrictEqual(fourWheelDriveUpsert.verifiedRoute.blocker_reasons, []);
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

assert.strictEqual(
  arcGisFeatureToNpsPublicTrailsRouteUpsert(
    {
      attributes: {
        OBJECTID: 101,
        TRLNAME: 'Literal Non Motorized',
        TRLSTATUS: 'Existing',
        TRLTYPE: 'Standard Terra Trail',
        TRLUSE: 'Non-Motorized',
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
  'Literal Non-Motorized NPS public trail records should not be promoted through the motorized adapter',
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
assert(syncFunction.includes('normalizeNpsPublicTrailsBboxes'), 'NPS Trails sync should support bounded multi-bbox batches');
assert(syncFunction.includes('limitPerBbox'), 'NPS Trails sync should bound each multi-bbox batch independently');
assert(syncFunction.includes('countPublicRecommendations(routeRows)'), 'NPS Trails sync should report promoted public recommendation telemetry');

const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-nps-trails-sync.yml');
assert(fs.existsSync(workflowPath), 'NPS public trails sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert(workflow.includes('bbox_batch'), 'NPS public trails workflow should expose a bounded bbox batch selector');
assert(workflow.includes('expanded_motorized_pilots'), 'NPS public trails workflow should default to the expanded motorized pilot batch');
assert(workflow.includes('big_south_fork') && workflow.includes('wrangell_st_elias'), 'NPS public trails workflow should include the expanded NPS pilot bbox keys');
assert(
  workflow.includes('everglades') && workflow.includes('timucuan') && workflow.includes('channel_islands'),
  'NPS public trails workflow should include the remaining lower-48 motorized pilot bbox keys',
);
assert(
  workflow.includes('glacier_bay') &&
    workflow.includes('klondike_gold_rush') &&
    workflow.includes('lake_clark') &&
    workflow.includes('yukon_charley'),
  'NPS public trails workflow should include the remaining Alaska motorized pilot bbox keys',
);
assert(
  workflow.includes('kaloko_honokohau') &&
    workflow.includes('american_samoa') &&
    workflow.includes('war_in_the_pacific'),
  'NPS public trails workflow should include the remaining island and territory motorized pilot bbox keys',
);

console.log('NPS public trails route catalog adapter checks passed');

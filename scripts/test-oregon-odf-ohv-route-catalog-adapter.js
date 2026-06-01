const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { DOMParser } = require('@xmldom/xmldom');

global.DOMParser = DOMParser;

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
  OREGON_ODF_OHV_GPX_SOURCES,
  OREGON_ODF_OHV_SOURCE,
  gpxTrackToOregonOdfOhvRouteUpsert,
  oregonOdfOhvSourceUpsert,
  parseOregonOdfOhvGpxTracks,
  selectOregonOdfOhvGpxSources,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogOregonOdfOhv.ts'));

assert.strictEqual(OREGON_ODF_OHV_SOURCE.providerId, 'oregon_odf_ohv_gpx');
assert(OREGON_ODF_OHV_SOURCE.sourceUri.includes('oregon.gov/odf/recreation/pages/motorizedtrails.aspx'));
assert(
  OREGON_ODF_OHV_GPX_SOURCES.some((source) => source.key === 'tillamook_class_i' && source.vehicleClass === 'class_i') &&
    OREGON_ODF_OHV_GPX_SOURCES.some((source) => source.key === 'tillamook_class_ii_iv' && source.vehicleClass === 'class_ii_iv') &&
    OREGON_ODF_OHV_GPX_SOURCES.some((source) => source.key === 'tillamook_class_iii' && source.vehicleClass === 'class_iii'),
  'Oregon ODF adapter should start with the official Tillamook State Forest Class I, Class II/IV, and Class III GPX files',
);
assert(
  OREGON_ODF_OHV_GPX_SOURCES.every((source) => source.url.startsWith('https://www.oregon.gov/odf/recreation/guides/')),
  'Oregon ODF GPX sources should point to Oregon.gov guide downloads',
);

const sourceUpsert = oregonOdfOhvSourceUpsert('2026-06-01T00:00:00.000Z');
assert.strictEqual(sourceUpsert.provider_id, 'oregon_odf_ohv_gpx');
assert.strictEqual(sourceUpsert.source_type, 'state_agency');
assert.strictEqual(sourceUpsert.authority, 'official_access');
assert.strictEqual(sourceUpsert.status, 'active');

const selected = selectOregonOdfOhvGpxSources('tillamook_class_ii_iv,missing-key');
assert.strictEqual(selected.length, 1);
assert.strictEqual(selected[0].key, 'tillamook_class_ii_iv');

const classIIGpx = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="MapSource 6.16.3" version="1.1">
  <metadata><time>2014-02-26T22:03:06Z</time></metadata>
  <trk>
    <name>7-UP</name>
    <trkseg>
      <trkpt lat="45.549739859998226" lon="-123.43439418822527"/>
      <trkpt lat="45.549739859998226" lon="-123.43439418822527"/>
      <trkpt lat="45.549611952155828" lon="-123.43415924347937"/>
      <trkpt lat="45.549602229148149" lon="-123.43397651799023"/>
      <trkpt lat="45.5495719704777" lon="-123.43381499871612"/>
    </trkseg>
  </trk>
</gpx>`;

const classIISource = OREGON_ODF_OHV_GPX_SOURCES.find((source) => source.key === 'tillamook_class_ii_iv');
const classIITracks = parseOregonOdfOhvGpxTracks(classIIGpx, classIISource);
assert.strictEqual(classIITracks.length, 1);
assert.strictEqual(classIITracks[0].name, '7-UP');
assert.strictEqual(classIITracks[0].metadataTime, '2014-02-26T22:03:06Z');
assert.strictEqual(classIITracks[0].segments[0].length, 4, 'Oregon ODF GPX parser should remove consecutive duplicate points');

const splitClassIITracks = parseOregonOdfOhvGpxTracks(
  `<gpx>
    <metadata><time>2014-02-26T22:03:06Z</time></metadata>
    <trk><name>7-UP</name><trkseg><trkpt lat="45.55" lon="-123.43"/><trkpt lat="45.551" lon="-123.431"/></trkseg></trk>
    <trk><name>7-UP</name><trkseg><trkpt lat="45.552" lon="-123.432"/><trkpt lat="45.553" lon="-123.433"/></trkseg></trk>
  </gpx>`,
  classIISource,
);
assert.strictEqual(splitClassIITracks.length, 1, 'Oregon GPX parser should aggregate exact same-name split tracks before DB upsert');
assert.strictEqual(splitClassIITracks[0].segments.length, 2);

const classIIUpsert = gpxTrackToOregonOdfOhvRouteUpsert(classIITracks[0], {
  sourceId: '00000000-0000-0000-0000-000000000060',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 0.01,
});

assert(classIIUpsert, 'An Oregon ODF Tillamook Class II/IV GPX track should produce a route-catalog curation record');
assert.strictEqual(classIIUpsert.verifiedRoute.public_id, 'oregon-odf-ohv-tillamook-class-ii-iv-7-up');
assert.strictEqual(classIIUpsert.verifiedRoute.name, 'Oregon ODF OHV Class II/IV 7-UP - Tillamook State Forest');
assert.strictEqual(classIIUpsert.verifiedRoute.recommendation_status, 'not_recommended');
assert.strictEqual(classIIUpsert.verifiedRoute.verification_status, 'partially_verified');
assert.strictEqual(classIIUpsert.verifiedRoute.review_status, 'approved');
assert.strictEqual(classIIUpsert.verifiedRoute.official_access_coverage_pct, 84);
assert.strictEqual(classIIUpsert.verifiedRoute.unknown_access_coverage_pct, 16);
assert.deepStrictEqual(classIIUpsert.verifiedRoute.vehicle_fit, ['full_size_4x4', 'utv']);
assert.strictEqual(classIIUpsert.verifiedRoute.route_geometry.type, 'LineString');
assert(
  classIIUpsert.verifiedRoute.warning_reasons.some((warning) => /open\/closed|fire restrictions/i.test(warning)),
  'Oregon ODF GPX records must retain current open/closed and fire-restriction caveats',
);
assert(
  classIIUpsert.verifiedRoute.blocker_reasons.some((blocker) => /not yet reviewed with current Oregon ODF closures/i.test(blocker)),
  'Oregon ODF GPX records should not become public recommendations before current-condition review',
);
assert.strictEqual(classIIUpsert.rawSourceFeature.provider_feature_id, 'oregon-odf-ohv:tillamook_class_ii_iv:7-up');
assert.strictEqual(classIIUpsert.verifiedRouteSource.source_role, 'primary');

const classISource = OREGON_ODF_OHV_GPX_SOURCES.find((source) => source.key === 'tillamook_class_i');
const classITrack = parseOregonOdfOhvGpxTracks(
  `<gpx><trk><name>Class I trail</name><trkseg><trkpt lat="45.55" lon="-123.43"/><trkpt lat="45.551" lon="-123.431"/></trkseg></trk></gpx>`,
  classISource,
)[0];
const classIUpsert = gpxTrackToOregonOdfOhvRouteUpsert(classITrack, {
  sourceId: '00000000-0000-0000-0000-000000000060',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 0.01,
});
assert(classIUpsert);
assert.deepStrictEqual(classIUpsert.verifiedRoute.vehicle_fit, ['atv']);

const classIIISource = OREGON_ODF_OHV_GPX_SOURCES.find((source) => source.key === 'tillamook_class_iii');
const classIIITrack = parseOregonOdfOhvGpxTracks(
  `<gpx><trk><name>Class III trail</name><trkseg><trkpt lat="45.56" lon="-123.44"/><trkpt lat="45.561" lon="-123.441"/></trkseg></trk></gpx>`,
  classIIISource,
)[0];
const classIIIUpsert = gpxTrackToOregonOdfOhvRouteUpsert(classIIITrack, {
  sourceId: '00000000-0000-0000-0000-000000000060',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 0.01,
});
assert(classIIIUpsert);
assert.deepStrictEqual(classIIIUpsert.verifiedRoute.vehicle_fit, ['motorcycle']);

assert.strictEqual(
  gpxTrackToOregonOdfOhvRouteUpsert({ ...classIITracks[0], segments: [[[-123.43, 45.55], [-123.4301, 45.5501]]] }, {
    sourceId: 'source',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  }),
  null,
  'Oregon ODF GPX tracks below the configured minimum miles should be ignored',
);

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-oregon-odf-ohv', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'Oregon ODF OHV sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'Oregon ODF OHV sync should require the server-side route catalog sync token');
assert(syncFunction.includes('route_sources') && syncFunction.includes('verified_routes'));
assert(syncFunction.includes('sourceKeys'), 'Oregon ODF OHV sync should support bounded named GPX source keys');
assert(syncFunction.includes('publicRecommendationCount: 0'), 'Oregon ODF OHV sync should report zero public recommendations for curation ingestion');
assert(syncFunction.includes('GEOMETRY_BATCH_SIZE = 10'), 'Oregon ODF OHV sync should use small DB batches for geometry-heavy GPX records');

const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-oregon-odf-ohv-sync.yml');
assert(fs.existsSync(workflowPath), 'Oregon ODF OHV sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert(workflow.includes('route-catalog-sync-oregon-odf-ohv'));
assert(workflow.includes('publicRecommendationCount'));
assert(workflow.includes('--write-out "%{http_code}"'), 'Oregon ODF OHV sync workflow should preserve response bodies on HTTP errors');
assert(workflow.includes('route-catalog-oregon-odf-ohv-sync-response.json'), 'Oregon ODF OHV sync workflow should print sanitized failed sync responses');

console.log('Oregon ODF OHV route catalog adapter checks passed');

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
  MICHIGAN_ORV_GPX_SOURCES,
  MICHIGAN_ORV_SOURCE,
  gpxTrackToMichiganOrvRouteUpsert,
  michiganOrvSourceUpsert,
  parseMichiganOrvGpxTracks,
  selectMichiganOrvGpxSources,
} = require(path.join(root, 'supabase', 'functions', '_shared', 'routeCatalogMichiganOrv.ts'));

assert.strictEqual(MICHIGAN_ORV_SOURCE.providerId, 'michigan_dnr_orv_gpx');
assert(MICHIGAN_ORV_SOURCE.sourceUri.includes('michigan.gov/dnr/things-to-do/orv-riding/maps-list'));
assert(
  MICHIGAN_ORV_GPX_SOURCES.some((source) => source.key === 'alcona_orv_trail' && source.routeKind === 'trail') &&
    MICHIGAN_ORV_GPX_SOURCES.some((source) => source.key === 'atlanta_route' && source.routeKind === 'route') &&
    MICHIGAN_ORV_GPX_SOURCES.some((source) => source.key === 'evart_motorcycle_trail' && source.routeKind === 'motorcycle'),
  'Michigan adapter should start with named official DNR ORV GPX pilot sources',
);

const sourceUpsert = michiganOrvSourceUpsert('2026-06-01T00:00:00.000Z');
assert.strictEqual(sourceUpsert.provider_id, 'michigan_dnr_orv_gpx');
assert.strictEqual(sourceUpsert.source_type, 'state_agency');
assert.strictEqual(sourceUpsert.authority, 'official_access');

const selected = selectMichiganOrvGpxSources(['atlanta_route', 'missing-key']);
assert.strictEqual(selected.length, 1);
assert.strictEqual(selected[0].key, 'atlanta_route');

const alconaGpx = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="Esri" version="1.1">
  <trk>
    <name>alcona_orv_trail</name>
    <desc>9.74795826712</desc>
    <trkseg>
      <trkpt lon="-83.77743492899998" lat="44.58646988600003"><time>2024-10-02T00:00:00Z</time></trkpt>
      <trkpt lon="-83.77743492899998" lat="44.58646988600003"><time>2024-10-02T00:00:00Z</time></trkpt>
      <trkpt lon="-83.77803093499995" lat="44.58574158300007"><time>2024-10-02T00:00:00Z</time></trkpt>
      <trkpt lon="-83.78006017399997" lat="44.58477854500006"><time>2024-10-02T00:00:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const alconaTracks = parseMichiganOrvGpxTracks(alconaGpx, MICHIGAN_ORV_GPX_SOURCES.find((source) => source.key === 'alcona_orv_trail'));
assert.strictEqual(alconaTracks.length, 1);
assert.strictEqual(alconaTracks[0].name, 'alcona_orv_trail');
assert.strictEqual(alconaTracks[0].publishedDistanceMiles, 9.74795826712);
assert.strictEqual(alconaTracks[0].segments[0].length, 3, 'Michigan GPX parser should remove consecutive duplicate track points');

const alconaUpsert = gpxTrackToMichiganOrvRouteUpsert(alconaTracks[0], {
  sourceId: '00000000-0000-0000-0000-000000000040',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 1,
});

assert(alconaUpsert, 'A named Michigan DNR ORV trail GPX track should produce a route-catalog curation record');
assert.strictEqual(alconaUpsert.verifiedRoute.public_id, 'michigan-dnr-orv-alcona-orv-trail');
assert.strictEqual(alconaUpsert.verifiedRoute.name, 'Michigan DNR ORV Trail Alcona ORV Trail');
assert.strictEqual(alconaUpsert.verifiedRoute.recommendation_status, 'not_recommended');
assert.strictEqual(alconaUpsert.verifiedRoute.verification_status, 'partially_verified');
assert.strictEqual(alconaUpsert.verifiedRoute.review_status, 'approved');
assert.strictEqual(alconaUpsert.verifiedRoute.official_access_coverage_pct, 80);
assert.strictEqual(alconaUpsert.verifiedRoute.unknown_access_coverage_pct, 20);
assert.deepStrictEqual(alconaUpsert.verifiedRoute.vehicle_fit, ['atv', 'utv', 'motorcycle']);
assert.strictEqual(alconaUpsert.verifiedRoute.distance_miles, 9.748);
assert.strictEqual(alconaUpsert.verifiedRoute.route_geometry.type, 'LineString');
assert(
  alconaUpsert.verifiedRoute.warning_reasons.some((warning) => /current closures, permits, local rules/i.test(warning)),
  'Michigan DNR GPX records must retain current-closure and permit caveats',
);
assert(
  alconaUpsert.verifiedRoute.blocker_reasons.some((blocker) => /not yet reviewed with current Michigan DNR closures/i.test(blocker)),
  'Michigan DNR GPX records should not become public recommendations before current-condition review',
);
assert.strictEqual(alconaUpsert.rawSourceFeature.provider_feature_id, 'michigan-dnr-orv:alcona_orv_trail');
assert.strictEqual(alconaUpsert.verifiedRouteSource.source_role, 'primary');

const routeGpx = `<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="Esri" version="1.1">
  <trk>
    <name>atlanta_route</name>
    <desc>2.29748917292</desc>
    <trkseg>
      <trkpt lon="-84.12948846099994" lat="45.047386231000075" />
      <trkpt lon="-84.12949787099996" lat="45.04682766600007" />
      <trkpt lon="-84.13015586699998" lat="45.04626534600004" />
    </trkseg>
  </trk>
</gpx>`;

const routeTrack = parseMichiganOrvGpxTracks(routeGpx, MICHIGAN_ORV_GPX_SOURCES.find((source) => source.key === 'atlanta_route'))[0];
const routeUpsert = gpxTrackToMichiganOrvRouteUpsert(routeTrack, {
  sourceId: '00000000-0000-0000-0000-000000000040',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 1,
});
assert(routeUpsert, 'A Michigan DNR ORV route should normalize as a source-backed curation route');
assert.deepStrictEqual(routeUpsert.verifiedRoute.vehicle_fit, ['full_size_4x4', 'atv', 'utv', 'motorcycle']);
assert.strictEqual(routeUpsert.verifiedRoute.official_access_coverage_pct, 85);

const motorcycleSource = MICHIGAN_ORV_GPX_SOURCES.find((source) => source.key === 'evart_motorcycle_trail');
const motorcycleTrack = parseMichiganOrvGpxTracks(
  `<gpx><trk><name>evart_motorcycle_trail</name><desc>1.5</desc><trkseg><trkpt lon="-85.2" lat="43.9"/><trkpt lon="-85.21" lat="43.91"/></trkseg></trk></gpx>`,
  motorcycleSource,
)[0];
const motorcycleUpsert = gpxTrackToMichiganOrvRouteUpsert(motorcycleTrack, {
  sourceId: '00000000-0000-0000-0000-000000000040',
  sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
  minMiles: 1,
});
assert(motorcycleUpsert);
assert.deepStrictEqual(motorcycleUpsert.verifiedRoute.vehicle_fit, ['motorcycle']);

assert.strictEqual(
  gpxTrackToMichiganOrvRouteUpsert({ ...alconaTracks[0], publishedDistanceMiles: 0.2 }, {
    sourceId: 'source',
    sourceLastVerifiedAt: '2026-06-01T00:00:00.000Z',
    minMiles: 1,
  }),
  null,
  'Michigan DNR GPX tracks below the configured minimum miles should be ignored',
);

const syncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-michigan-orv', 'index.ts');
assert(fs.existsSync(syncFunctionPath), 'Michigan DNR ORV sync Edge Function should exist');
const syncFunction = fs.readFileSync(syncFunctionPath, 'utf8');
assert(syncFunction.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'Michigan ORV sync should require the server-side route catalog sync token');
assert(syncFunction.includes('route_sources') && syncFunction.includes('verified_routes'));
assert(syncFunction.includes('sourceKeys'), 'Michigan ORV sync should support bounded named GPX source keys');
assert(syncFunction.includes('publicRecommendationCount: 0'), 'Michigan ORV sync should report zero public recommendations for curation ingestion');

console.log('Michigan DNR ORV route catalog adapter checks passed');

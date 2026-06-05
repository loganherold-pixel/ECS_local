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
  normalizeUsgsTrailsBboxes,
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

const normalizedBboxes = normalizeUsgsTrailsBboxes([
  { key: 'sierra_nevada', label: 'Sierra Nevada mountain context', xmin: -123.2, ymin: 38.2, xmax: -118.6, ymax: 41.8 },
  { key: 'mojave_death_valley_desert', label: 'Mojave and Death Valley desert context', west: -118.4, south: 34.5, east: -114.6, north: 37.6 },
]);
assert.strictEqual(normalizedBboxes.length, 2);
assert.strictEqual(normalizedBboxes[0].key, 'sierra_nevada');
assert.strictEqual(normalizedBboxes[1].bbox.xmin, -118.4);
assert.strictEqual(normalizeUsgsTrailsBboxes(null), null);

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
assert(syncFunction.includes('normalizeUsgsTrailsBboxes'), 'USGS Trails sync should support bounded multi-bbox batches');
assert(syncFunction.includes('limitPerBbox'), 'USGS Trails sync should bound each desert/mountain/wilderness-context bbox independently');
assert(syncFunction.includes('publicRecommendationCount: 0'), 'USGS Trails sync should report zero public recommendations for supplemental geometry');

const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-usgs-trails-sync.yml');
assert(fs.existsSync(workflowPath), 'USGS Trails sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert(workflow.includes('bbox_batch'), 'USGS Trails workflow should expose a bounded bbox batch selector');
assert(workflow.includes('desert_mountain_wilderness_context'), 'USGS Trails workflow should default to the broad terrain-context bbox batch');
for (const key of [
  'sierra_nevada',
  'mojave_death_valley_desert',
  'moab_canyonlands_desert',
  'grand_canyon_arizona_strip',
  'great_basin_mountains',
  'san_juan_mountains',
  'black_rock_high_rock_desert',
  'pacific_northwest_cascades',
  'oregon_high_desert',
  'idaho_sawtooth_boise',
  'montana_northern_rockies',
  'wyoming_wind_river_absaroka',
  'colorado_front_range_high_country',
  'arizona_sky_islands_sonoran',
  'new_mexico_gila_sacramento',
  'ozark_ouachita_highlands',
  'southern_appalachians',
  'upper_great_lakes_northwoods',
  'northern_new_england_appalachians',
  'california_north_coast_klamath',
  'southern_california_mountains_desert',
  'nevada_central_basin_ranges',
  'uinta_wasatch_mountains',
  'yellowstone_teton_absaroka',
  'dakota_badlands_missouri_breaks',
  'southeast_piney_woods',
  'florida_sandhills_swamps',
  'adirondack_northern_new_york',
  'pennsylvania_alleghenies',
  'alaska_southcentral_mountains',
  'hawaii_volcanic_highlands',
  'appalachian_plateau_coalfields',
  'olympic_peninsula_coast_ranges',
  'washington_columbia_plateau',
  'oregon_coast_range',
  'arizona_mogollon_rim',
  'wyoming_bighorn_powder',
  'nebraska_sandhills_pine_ridge',
  'missouri_ozark_highlands',
  'central_appalachians_monongahela',
  'new_jersey_pine_barrens',
  'lower_michigan_state_forests',
  'utah_dixie_bryce_plateaus',
  'alaska_southeast_tongass',
  'idaho_panhandle_selkirks',
  'south_dakota_black_hills',
  'georgia_alabama_piedmont',
  'alabama_talladega_bankhead',
  'mississippi_delta_hills',
  'kentucky_cumberland_plateau',
  'ohio_wayne_appalachian_foothills',
  'alaska_kenai_chugach',
  'arkansas_boston_ouachita',
  'wisconsin_northwoods',
  'minnesota_iron_range_arrowhead',
  'north_carolina_pisgah_nantahala',
  'oregon_blue_mountains',
  'washington_okanogan_highlands',
  'montana_prairie_breaks',
  'wyoming_red_desert_south_pass',
  'utah_west_desert_san_rafael',
  'colorado_san_luis_sangre_de_cristo',
  'tennessee_cumberland_highlands',
  'virginia_blue_ridge',
  'west_virginia_allegheny_plateau',
  'new_hampshire_white_mountains',
  'louisiana_kisatchie_piney_woods',
  'north_dakota_badlands',
  'oregon_klamath_siskiyou',
  'california_central_sierra_inyo',
  'idaho_eastern_targhee',
  'wyoming_snowy_range_laramie',
  'colorado_yampa_white_river',
  'utah_la_sal_abajo_mountains',
  'new_mexico_zuni_cibola',
  'pennsylvania_poconos_endless_mountains',
  'new_york_tug_hill_adirondack_west',
  'new_mexico_sacramento_capitan',
  'colorado_grand_mesa_uncompahgre',
  'massachusetts_berkshires',
  'california_mendocino_trinity',
  'nevada_spring_sheep_ranges',
  'arizona_prescott_bradshaw',
  'montana_beartooth_crazies',
  'montana_bitterroot_sapphire',
  'wyoming_bighorn_mountains',
  'south_carolina_upstate_blue_ridge',
  'new_york_finger_lakes_southern_tier',
  'delaware_maryland_coastal_plain',
  'michigan_upper_peninsula_keweenaw',
  'vermont_green_mountains',
  'maine_northern_woods',
  'oregon_umpqua_rogue_cascades',
  'california_modoc_lassen_plateau',
  'nevada_humboldt_ruby_ranges',
  'arizona_kaibab_coconino_plateaus',
  'new_mexico_jemez_chama',
  'colorado_sawatch_gunnison',
  'colorado_pikes_peak_south_park',
  'utah_book_cliffs_bears_ears',
  'idaho_clearwater_bitterroot',
  'idaho_magic_valley_south_hills',
  'montana_kootenai_cabinet',
  'maryland_pennsylvania_ridge_valley',
]) {
  assert(workflow.includes(key), `USGS Trails workflow should include ${key} bbox preset`);
}

console.log('USGS Trails route catalog adapter checks passed');

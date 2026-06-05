const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

const {
  ROUTE_CATALOG_SYNC_INVENTORY,
  buildRouteCatalogSyncInvocationPlan,
} = require(path.join(root, 'scripts', 'route-catalog-sync-inventory.js'));

assert(
  packageJson.includes('"route-catalog:sync:dry-run"'),
  'package.json should expose a route catalog sync dry-run command',
);
assert(
  packageJson.includes('"route-catalog:sync:invoke"'),
  'package.json should expose an explicit route catalog sync invocation command',
);
assert(
  packageJson.includes('"test:route-catalog-sync-invocation-plan"'),
  'package.json should expose the route catalog sync invocation-plan test',
);

const runnerPath = path.join(root, 'scripts', 'route-catalog-sync-invoke.js');
assert(fs.existsSync(runnerPath), 'Route catalog sync invocation runner should exist');

const runnerSource = fs.readFileSync(runnerPath, 'utf8');
for (const required of [
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'ECS_ROUTE_CATALOG_SYNC_TOKEN',
  'resolveSyncSupabaseUrl',
  'x-ecs-sync-token',
  '--dry-run',
  '--adapter',
  '--all-direct',
  '--deep-backfill',
  '--payload',
  '--states',
  '--layers',
  '--limit-per-state-layer',
  'redactSecret',
  'currentConditionBlockedRouteCount',
  'currentConditionAdvisoryCount',
]) {
  assert(runnerSource.includes(required), `Sync invocation runner should include ${required}`);
}
assert(!runnerSource.includes('console.log(process.env.ECS_ROUTE_CATALOG_SYNC_TOKEN'), 'Runner must not print sync tokens');

const plan = buildRouteCatalogSyncInvocationPlan();
assert.strictEqual(
  plan.length,
  ROUTE_CATALOG_SYNC_INVENTORY.length,
  'Invocation plan should include every route catalog sync inventory entry',
);

const byKey = new Map(plan.map((entry) => [entry.key, entry]));

for (const entry of plan) {
  assert(entry.key && entry.providerId && entry.functionName, 'Plan entries should preserve inventory identity');
  assert(entry.workflowPath && entry.functionPath, `${entry.key} should keep workflow/function paths available for operators`);
  assert(
    entry.invocationMode === 'direct_edge_function' || entry.invocationMode === 'workflow_preprocess_required',
    `${entry.key} should declare how it can be invoked safely`,
  );
  assert(
    entry.publicRecommendationPolicy === 'aggregate_recommendable_with_closure_gate' ||
      entry.publicRecommendationPolicy === 'curation_only_zero_public_recommendations' ||
      entry.publicRecommendationPolicy === 'official_source_recommendable_with_condition_warnings' ||
      entry.publicRecommendationPolicy === 'review_only_zero_public_recommendations',
    `${entry.key} should declare recommendation policy in the invocation plan`,
  );
  assert(
    Number.isInteger(entry.expectedMaxPublicRecommendationCount) && entry.expectedMaxPublicRecommendationCount >= 0,
    `${entry.key} should declare expected public recommendation upper bound`,
  );
  assert(
    entry.safetyNotes.some((note) => note.includes('sync token')) &&
      entry.safetyNotes.some((note) => note.includes('service-role')) &&
      entry.safetyNotes.some((note) => note.includes('bounded')),
    `${entry.key} should carry operator-facing safety notes`,
  );

  if (
    entry.publicRecommendationPolicy === 'curation_only_zero_public_recommendations' ||
    entry.publicRecommendationPolicy === 'review_only_zero_public_recommendations'
  ) {
    assert.strictEqual(
      entry.expectedMaxPublicRecommendationCount,
      0,
      `${entry.key} review-only/curation-only sync must not produce public recommendations`,
    );
  }

  if (entry.invocationMode === 'direct_edge_function') {
    assert(entry.defaultPayload && typeof entry.defaultPayload === 'object', `${entry.key} direct sync should have a default payload`);
  } else {
    assert.strictEqual(entry.defaultPayload, null, `${entry.key} workflow-preprocess sync should not pretend to have a direct payload`);
    assert(entry.preprocessReason, `${entry.key} workflow-preprocess sync should explain why direct invocation is blocked`);
  }
}

const usfsDefaultForests = byKey.get('usfs_mvum').defaultPayload.forests;
assert(
  usfsDefaultForests.length >= 117,
  'USFS MVUM default payload should keep the expanded national coverage set',
);
assert.strictEqual(
  new Set(usfsDefaultForests).size,
  usfsDefaultForests.length,
  'USFS MVUM default payload should not duplicate forest/source slugs',
);
for (const requiredForest of [
  'apache-sitgreaves-national-forests',
  'angeles-national-forest',
  'malheur-national-forest',
  'national-forests-in-alabama',
  'pawnee-national-grassland',
  'cimarron-national-grassland',
  'comanche-national-grassland',
  'thunder-basin-national-grassland',
  'crooked-river-national-grassland',
  'kiowa-rita-blanca-national-grasslands',
]) {
  assert(usfsDefaultForests.includes(requiredForest), `USFS MVUM default payload should include ${requiredForest}`);
}
assert(
  !usfsDefaultForests.includes('kiowa-national-grassland') &&
    !usfsDefaultForests.includes('rita-blanca-national-grassland'),
  'USFS MVUM default payload should use the combined Kiowa/Rita Blanca source instead of duplicate source runs',
);
assert.strictEqual(
  byKey.get('usfs_mvum').defaultPayload.maxAllowableOffset,
  0.000025,
  'USFS MVUM sync should default to bounded ArcGIS geometry simplification for dense trail sources',
);
assert.strictEqual(
  byKey.get('usfs_mvum').defaultPayload.deepPagination,
  false,
  'USFS MVUM sync should keep cautious pagination as the default operator payload',
);
assert.strictEqual(
  byKey.get('usfs_mvum').deepBackfillPayload.deepPagination,
  true,
  'USFS MVUM sync should expose an explicit deep-pagination backfill payload',
);
assert.strictEqual(
  byKey.get('usfs_mvum').deepBackfillPayload.limitPerForestLayer,
  2500,
  'USFS MVUM deep backfill payload should raise the bounded per-forest/layer cap enough to cover current official source tails',
);
assert.deepStrictEqual(byKey.get('blm_gtlf').defaultPayload.states, ['AK', 'AZ', 'CA', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY']);
assert.deepStrictEqual(byKey.get('blm_gtlf').defaultPayload.layers, [0, 1, 2, 3]);
assert.deepStrictEqual(
  byKey.get('blm_gtlf').deepBackfillPayload,
  {
    states: ['UT'],
    layers: [0],
    minMiles: 1,
    limitPerStateLayer: 250,
  },
  'BLM GTLF should expose a bounded Utah layer-0 backfill payload that reaches the official route-anchor tail',
);
assert.strictEqual(
  byKey.get('blm_gtlf').publicRecommendationPolicy,
  'aggregate_recommendable_with_closure_gate',
  'BLM GTLF should expose a bounded aggregate public-recommendation pilot instead of curation-only source segments',
);
assert(
  byKey.get('blm_gtlf').expectedMaxPublicRecommendationCount > 0,
  'BLM GTLF aggregate pilot should allow bounded public recommendation telemetry',
);
const blmDeepBackfillDryRun = JSON.parse(execFileSync(
  process.execPath,
  [runnerPath, '--dry-run', '--adapter', 'blm_gtlf', '--deep-backfill'],
  { cwd: root, encoding: 'utf8' },
));
assert.deepStrictEqual(
  blmDeepBackfillDryRun.adapters[0].selectedPayload,
  byKey.get('blm_gtlf').deepBackfillPayload,
  'BLM GTLF deep-backfill dry-run should show the exact payload that live invocation would send',
);
const blmNewMexicoBackfillDryRun = JSON.parse(execFileSync(
  process.execPath,
  [runnerPath, '--dry-run', '--adapter', 'blm_gtlf', '--states', 'NM', '--layers', '0,2', '--limit-per-state-layer', '500'],
  { cwd: root, encoding: 'utf8' },
));
assert.deepStrictEqual(
  blmNewMexicoBackfillDryRun.adapters[0].selectedPayload,
  {
    states: ['NM'],
    layers: [0, 2],
    minMiles: 1,
    limitPerStateLayer: 500,
  },
  'BLM GTLF New Mexico backfill dry-run should build a bounded state/layer override without replacing the Utah deep-backfill preset',
);
assert.deepStrictEqual(byKey.get('michigan_dnr_orv_gpx').defaultPayload.sourceKeys, [
  'alcona_orv_trail',
  'atlanta_route',
  'evart_motorcycle_trail',
  'statewide_orv_trail_gpx',
]);
assert.strictEqual(
  byKey.get('michigan_dnr_orv_gpx').defaultPayload.syncScope,
  'statewide',
  'Michigan DNR ORV should include the bounded statewide GPX source set in the default direct sync payload',
);
const michiganStatewideBackfillPayload = byKey.get('michigan_dnr_orv_gpx').deepBackfillPayload;
assert(
  michiganStatewideBackfillPayload,
  'Michigan DNR ORV should expose an explicit statewide backfill payload',
);
assert.deepStrictEqual(michiganStatewideBackfillPayload.sourceKeys, [
  'alcona_orv_trail',
  'atlanta_route',
  'evart_motorcycle_trail',
  'statewide_orv_trail_gpx',
]);
assert.strictEqual(
  michiganStatewideBackfillPayload.syncScope,
  'statewide',
  'Michigan DNR ORV should preserve an explicit statewide backfill payload for larger operator-run syncs',
);
assert.strictEqual(
  michiganStatewideBackfillPayload.maxTracksPerSource,
  100,
  'Michigan DNR ORV statewide backfill should raise the bounded per-source track cap',
);
assert.strictEqual(
  byKey.get('michigan_dnr_orv_gpx').expectedMaxPublicRecommendationCount,
  400,
  'Michigan DNR ORV public recommendation telemetry should cover the largest bounded statewide backfill',
);
assert.strictEqual(
  byKey.get('michigan_dnr_orv_gpx').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Michigan DNR ORV should now allow bounded official-source public recommendations with current-condition warnings',
);
assert.strictEqual(
  byKey.get('minnesota_dnr_ohv_trails').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Minnesota DNR OHV should now allow bounded official-source public recommendations with current-condition warnings',
);
const minnesotaStatewideBackfillPayload = byKey.get('minnesota_dnr_ohv_trails').deepBackfillPayload;
assert(
  minnesotaStatewideBackfillPayload,
  'Minnesota DNR OHV should expose an explicit statewide GeoPackage backfill payload',
);
assert.strictEqual(
  minnesotaStatewideBackfillPayload.syncScope,
  'statewide',
  'Minnesota DNR OHV statewide backfill payload should be explicit instead of changing the default workflow-preprocess run',
);
assert.strictEqual(
  minnesotaStatewideBackfillPayload.maxFeatures,
  1000,
  'Minnesota DNR OHV statewide backfill should remain bounded by the Edge Function max feature cap',
);
assert(
  byKey.get('minnesota_dnr_ohv_trails').preprocessReason.includes('defaults to the bounded statewide'),
  'Minnesota DNR OHV preprocess note should tell operators the durable workflow now defaults to bounded statewide conversion',
);
assert.strictEqual(
  byKey.get('oregon_odf_ohv_gpx').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Oregon ODF OHV should now allow bounded official-source public recommendations with current-condition warnings',
);
assert.strictEqual(
  byKey.get('oregon_odf_ohv_gpx').defaultPayload.maxTracksPerSource,
  200,
  'Oregon ODF OHV default payload should use the largest Edge-bounded per-source GPX track cap',
);
assert.strictEqual(
  byKey.get('oregon_odf_ohv_gpx').expectedMaxPublicRecommendationCount,
  600,
  'Oregon ODF OHV public recommendation telemetry should cover three GPX sources capped at 200 tracks each',
);
assert.strictEqual(
  byKey.get('colorado_cpw_designated_trails').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Colorado CPW Designated Trails should allow bounded official-source public recommendations with current-condition warnings',
);
assert.strictEqual(
  byKey.get('colorado_cpw_designated_trails').defaultPayload.maxFeatures,
  150,
  'Colorado CPW default sync should stay bounded for the first official state-source pass',
);
assert.strictEqual(
  byKey.get('colorado_cpw_designated_trails').deepBackfillPayload.maxFeatures,
  500,
  'Colorado CPW backfill should expose a larger but still bounded FeatureServer pull',
);
assert.strictEqual(
  byKey.get('utah_sgid_trails').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Utah SGID Trails should allow bounded official-source public recommendations with current-condition warnings',
);
assert.strictEqual(
  byKey.get('utah_sgid_trails').defaultPayload.maxFeatures,
  250,
  'Utah SGID Trails default sync should stay bounded for the first official statewide pass',
);
assert.strictEqual(
  byKey.get('utah_sgid_trails').deepBackfillPayload.maxFeatures,
  1000,
  'Utah SGID Trails backfill should expose a larger but still bounded FeatureServer pull',
);
assert.strictEqual(
  byKey.get('arizona_state_parks_trails').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'Arizona State Parks Trails should allow bounded official-source public recommendations with current-condition warnings',
);
assert.strictEqual(
  byKey.get('arizona_state_parks_trails').defaultPayload.maxFeatures,
  250,
  'Arizona State Parks Trails default sync should stay bounded for the first official statewide pass',
);
assert.strictEqual(
  byKey.get('arizona_state_parks_trails').deepBackfillPayload.maxFeatures,
  1000,
  'Arizona State Parks Trails backfill should expose a larger but still bounded FeatureServer pull',
);
assert.strictEqual(
  byKey.get('nps_public_trails').publicRecommendationPolicy,
  'official_source_recommendable_with_condition_warnings',
  'NPS public trails should now allow bounded official-source public recommendations with park-unit/current-alert warnings',
);
const npsDefaultBboxes = byKey.get('nps_public_trails').defaultPayload.bboxes || [];
assert(
  Array.isArray(npsDefaultBboxes) && npsDefaultBboxes.length > 0,
  'NPS public trails default payload should include bounded multi-bbox presets',
);
assert.deepStrictEqual(
  npsDefaultBboxes.map((bbox) => bbox.key),
  [
    'joshua_tree',
    'big_south_fork',
    'shenandoah',
    'everglades',
    'timucuan',
    'channel_islands',
    'denali',
    'wrangell_st_elias',
    'glacier_bay',
    'klondike_gold_rush',
    'lake_clark',
    'yukon_charley',
    'kaloko_honokohau',
    'american_samoa',
    'war_in_the_pacific',
  ],
  'NPS public trails should default to bounded official motorized trail units instead of one broad western bbox',
);
assert.strictEqual(
  byKey.get('nps_public_trails').defaultPayload.limitPerBbox,
  150,
  'NPS public trails default multi-bbox sync should stay bounded per unit',
);
assert.strictEqual(
  byKey.get('nps_public_trails').expectedMaxPublicRecommendationCount,
  900,
  'NPS public trails max public recommendation guard should cover the bounded multi-bbox pilot',
);
assert.strictEqual(
  byKey.get('usgs_digital_trails').publicRecommendationPolicy,
  'curation_only_zero_public_recommendations',
  'USGS Digital Trails should remain supplemental geometry and produce zero public recommendations without authoritative access corroboration',
);
const usgsDefaultBboxes = byKey.get('usgs_digital_trails').defaultPayload.bboxes || [];
assert.deepStrictEqual(
  usgsDefaultBboxes.map((bbox) => bbox.key),
  [
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
  ],
  'USGS Digital Trails should default to bounded desert, mountain, forest, and wilderness-context supplemental geometry bboxes',
);
assert.strictEqual(
  byKey.get('usgs_digital_trails').defaultPayload.limitPerBbox,
  150,
  'USGS Digital Trails default multi-bbox sync should stay bounded per terrain context',
);
assert.strictEqual(
  byKey.get('stitch_groups').publicRecommendationPolicy,
  'review_only_zero_public_recommendations',
  'Stitch groups should persist review-only drafts without producing public recommendations',
);
assert.strictEqual(
  byKey.get('stitch_groups').invocationMode,
  'workflow_preprocess_required',
  'Stitch groups should require the durable dry-run plan workflow before service-role writes',
);
assert(
  byKey.get('stitch_groups').preprocessReason.includes('confirm_write'),
  'Stitch group preprocess notes should call out explicit confirm_write approval',
);
assert.strictEqual(byKey.get('minnesota_dnr_ohv_trails').invocationMode, 'workflow_preprocess_required');
assert(
  byKey.get('minnesota_dnr_ohv_trails').preprocessReason.includes('GeoPackage'),
  'Minnesota sync should explain that the durable workflow converts the GeoPackage before invocation',
);

console.log('Route catalog sync invocation plan checks passed');

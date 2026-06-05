const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

assert(
  packageJson.includes('"route-catalog:coverage:dry-run"'),
  'package.json should expose a dry-run coverage audit command',
);
assert(
  packageJson.includes('"route-catalog:coverage:audit"'),
  'package.json should expose a live coverage audit command',
);
assert(
  packageJson.includes('"route-catalog:coverage:audit": "node ./scripts/route-catalog-coverage-audit.js --all"'),
  'live coverage audit npm command should audit all probes by default for PowerShell-friendly operation',
);
assert(
  packageJson.includes('"test:route-catalog-coverage-audit"'),
  'package.json should expose the route catalog coverage audit test',
);

const auditPath = path.join(root, 'scripts', 'route-catalog-coverage-audit.js');
assert(fs.existsSync(auditPath), 'Route catalog coverage audit script should exist');

const {
  ROUTE_CATALOG_COVERAGE_PROBES,
  buildRouteCatalogCoverageAuditPlan,
  isRetryableAuditError,
  summarizeAuditProbeError,
  summarizeSearchResponse,
} = require(auditPath);

const requiredProbeKeys = [
  'tahoe_national_forest',
  'mendocino_national_forest',
  'san_juan_national_forest',
  'coconino_national_forest',
  'apache_sitgreaves_national_forests',
  'manti_la_sal_national_forest',
  'sawtooth_national_forest',
  'deschutes_national_forest',
  'kaibab_national_forest',
  'prescott_national_forest',
  'gila_national_forest',
  'santa_fe_national_forest',
  'carson_national_forest',
  'rio_grande_national_forest',
  'gmug_national_forests',
  'humboldt_toiyabe_national_forest',
  'pike_san_isabel_national_forests',
  'pawnee_national_grassland',
  'cimarron_national_grassland',
  'comanche_national_grassland',
  'thunder_basin_national_grassland',
  'inyo_national_forest',
  'plumas_national_forest',
  'lassen_national_forest',
  'shasta_trinity_national_forest',
  'umpqua_national_forest',
  'fremont_winema_national_forest',
  'idaho_panhandle_national_forests',
  'helena_lewis_clark_national_forest',
  'fishlake_national_forest',
  'black_hills_national_forest',
  'uinta_wasatch_cache_national_forest',
  'caribou_targhee_national_forest',
  'klamath_national_forest',
  'willamette_national_forest',
  'boise_national_forest',
  'lolo_national_forest',
  'salmon_challis_national_forest',
  'stanislaus_national_forest',
  'dixie_national_forest',
  'bitterroot_national_forest',
  'mt_hood_national_forest',
  'coronado_national_forest',
  'angeles_national_forest',
  'sierra_national_forest',
  'huron_manistee_national_forest',
  'ozark_st_francis_national_forest',
  'ottawa_national_forest',
  'hiawatha_national_forest',
  'chequamegon_nicolet_national_forest',
  'national_forests_in_florida',
  'national_forests_in_alabama',
  'ouachita_national_forest',
  'mark_twain_national_forest',
  'national_forests_in_mississippi',
  'kisatchie_national_forest',
  'george_washington_jefferson_national_forest',
  'francis_marion_sumter_national_forests',
  'national_forests_in_texas',
  'national_forests_in_north_carolina',
  'allegheny_national_forest',
  'cherokee_national_forest',
  'daniel_boone_national_forest',
  'rogue_river_siskiyou_national_forests',
  'medicine_bow_routt_national_forest',
  'kootenai_national_forest',
  'gifford_pinchot_national_forest',
  'arapaho_roosevelt_national_forests',
  'umatilla_national_forest',
  'ochoco_national_forest',
  'malheur_national_forest',
  'crooked_river_national_grassland',
  'cibola_national_forest',
  'eldorado_national_forest',
  'nez_perce_clearwater_national_forest',
  'payette_national_forest',
  'superior_national_forest',
  'chippewa_national_forest',
  'sequoia_national_forest',
  'ashley_national_forest',
  'bridger_teton_national_forest',
  'siuslaw_national_forest',
  'lincoln_national_forest',
  'white_river_national_forest',
  'mt_baker_snoqualmie_national_forest',
  'flathead_national_forest',
  'olympic_national_forest',
  'custer_national_forest',
  'bighorn_national_forest',
  'colville_national_forest',
  'chattahoochee_oconee_national_forests',
  'nebraska_national_forest',
  'shoshone_national_forest',
  'san_bernardino_national_forest',
  'los_padres_national_forest',
  'dakota_prairie_grasslands',
  'monongahela_national_forest',
  'land_between_the_lakes_nra',
  'shawnee_national_forest',
  'cleveland_national_forest',
  'green_mountain_finger_lakes_national_forests',
  'lake_tahoe_basin_management_unit',
  'kiowa_rita_blanca_national_grasslands',
  'wayne_national_forest',
  'white_mountain_national_forest',
  'wallowa_whitman_national_forest',
  'hoosier_national_forest',
  'columbia_river_gorge_national_scenic_area',
  'okanogan_wenatchee_national_forest',
  'six_rivers_national_forest',
  'tonto_national_forest',
  'beaverhead_deerlodge_national_forest',
  'chugach_national_forest',
  'custer_gallatin_national_forest',
  'gallatin_national_forest',
  'modoc_national_forest',
  'tongass_national_forest',
  'michigan_dnr_orv_pilot',
  'michigan_dnr_orv_tomahawk_kalkaska',
  'michigan_dnr_orv_missaukee_junction',
  'michigan_dnr_orv_grand_traverse',
  'minnesota_dnr_ohv_pilot',
  'minnesota_dnr_ohv_prospectors',
  'minnesota_dnr_ohv_fourtown_grygla',
  'minnesota_dnr_ohv_voyageur_country',
  'oregon_odf_ohv_pilot',
  'oregon_odf_tillamook_class_i',
  'oregon_odf_tillamook_class_ii_iv',
  'oregon_odf_tillamook_class_iii',
  'colorado_cpw_designated_trails_pilot',
  'colorado_cpw_bockman_road',
  'colorado_cpw_mendenhall_road',
  'colorado_cpw_diamond_peaks',
  'colorado_cpw_gould_mountain_road',
  'colorado_cpw_montgomery_pass_west',
  'colorado_cpw_bull_mountain_road',
  'colorado_cpw_government_creek_road',
  'colorado_cpw_little_government_creek_road',
  'colorado_cpw_kiwi_road',
  'colorado_cpw_custer_draw_road',
  'colorado_cpw_south_canadian_road',
  'colorado_cpw_ruby_jewel_road',
  'colorado_cpw_grass_creek',
  'colorado_cpw_american_lakes_access',
  'colorado_cpw_upper_crags_basin_access',
  'colorado_cpw_dry_gulch_road',
  'colorado_cpw_silver_creek_access',
  'colorado_cpw_american_lakes_trail',
  'colorado_cpw_sweitzer_trail',
  'colorado_cpw_snowmobile_connector',
  'colorado_cpw_horseshoe_trail',
  'colorado_cpw_old_fulford_road',
  'colorado_cpw_south_shore_ohv_track',
  'utah_sgid_trails_san_juan',
  'arizona_state_parks_trails_gila',
  'blm_ak_gtlf',
  'blm_az_gtlf',
  'blm_ca_nv_pilot',
  'blm_co_gtlf',
  'blm_id_gtlf',
  'blm_mt_gtlf',
  'blm_nm_gtlf',
  'blm_nm_taos_punche_valley_road',
  'blm_nm_taos_sure_shot',
  'blm_nm_taos_pinabetoso_peaks_road',
  'blm_nm_quebradas_road',
  'blm_nm_angel_peak_loop_road',
  'blm_ut_gtlf',
  'blm_ut_smoky_mountain_alvey_wash',
  'blm_ut_wolverine_loop_road',
  'blm_ut_heads_of_the_creeks_road',
  'blm_ut_horse_mountain_road',
  'blm_ut_fourmile_bench',
  'blm_ut_paria_breaks',
  'blm_wy_gtlf',
  'nps_public_trails_joshua_tree',
  'nps_public_trails_big_south_fork',
  'nps_public_trails_shenandoah',
  'nps_public_trails_everglades',
  'nps_public_trails_timucuan',
  'nps_public_trails_channel_islands',
  'nps_public_trails_denali',
  'nps_public_trails_wrangell_st_elias',
  'nps_public_trails_glacier_bay',
  'nps_public_trails_klondike_gold_rush',
  'nps_public_trails_lake_clark',
  'nps_public_trails_yukon_charley',
  'nps_public_trails_kaloko_honokohau',
  'nps_public_trails_american_samoa',
  'nps_public_trails_war_in_the_pacific',
  'usgs_nps_sierra_context',
  'usgs_mojave_death_valley_desert_context',
  'usgs_moab_canyonlands_desert_context',
  'usgs_grand_canyon_arizona_strip_context',
  'usgs_great_basin_mountains_context',
  'usgs_san_juan_mountains_context',
  'usgs_black_rock_high_rock_desert_context',
  'usgs_pacific_northwest_cascades_context',
  'usgs_oregon_high_desert_context',
  'usgs_idaho_sawtooth_boise_context',
  'usgs_montana_northern_rockies_context',
  'usgs_wyoming_wind_river_absaroka_context',
  'usgs_colorado_front_range_high_country_context',
  'usgs_arizona_sky_islands_sonoran_context',
  'usgs_new_mexico_gila_sacramento_context',
  'usgs_ozark_ouachita_highlands_context',
  'usgs_southern_appalachians_context',
  'usgs_upper_great_lakes_northwoods_context',
  'usgs_northern_new_england_appalachians_context',
  'usgs_california_north_coast_klamath_context',
  'usgs_southern_california_mountains_desert_context',
  'usgs_nevada_central_basin_ranges_context',
  'usgs_uinta_wasatch_mountains_context',
  'usgs_yellowstone_teton_absaroka_context',
  'usgs_dakota_badlands_missouri_breaks_context',
  'usgs_southeast_piney_woods_context',
  'usgs_florida_sandhills_swamps_context',
  'usgs_adirondack_northern_new_york_context',
  'usgs_pennsylvania_alleghenies_context',
  'usgs_alaska_southcentral_mountains_context',
  'usgs_hawaii_volcanic_highlands_context',
  'usgs_appalachian_plateau_coalfields_context',
  'usgs_olympic_peninsula_coast_ranges_context',
  'usgs_washington_columbia_plateau_context',
  'usgs_oregon_coast_range_context',
  'usgs_arizona_mogollon_rim_context',
  'usgs_wyoming_bighorn_powder_context',
  'usgs_nebraska_sandhills_pine_ridge_context',
  'usgs_missouri_ozark_highlands_context',
  'usgs_central_appalachians_monongahela_context',
  'usgs_new_jersey_pine_barrens_context',
  'usgs_lower_michigan_state_forests_context',
  'usgs_utah_dixie_bryce_plateaus_context',
  'usgs_alaska_southeast_tongass_context',
  'usgs_idaho_panhandle_selkirks_context',
  'usgs_south_dakota_black_hills_context',
  'usgs_georgia_alabama_piedmont_context',
  'usgs_alabama_talladega_bankhead_context',
  'usgs_mississippi_delta_hills_context',
  'usgs_kentucky_cumberland_plateau_context',
  'usgs_ohio_wayne_appalachian_foothills_context',
  'usgs_alaska_kenai_chugach_context',
  'usgs_arkansas_boston_ouachita_context',
  'usgs_wisconsin_northwoods_context',
  'usgs_minnesota_iron_range_arrowhead_context',
  'usgs_north_carolina_pisgah_nantahala_context',
  'usgs_oregon_blue_mountains_context',
  'usgs_washington_okanogan_highlands_context',
  'usgs_montana_prairie_breaks_context',
  'usgs_wyoming_red_desert_south_pass_context',
  'usgs_utah_west_desert_san_rafael_context',
  'usgs_colorado_san_luis_sangre_de_cristo_context',
  'usgs_tennessee_cumberland_highlands_context',
  'usgs_virginia_blue_ridge_context',
  'usgs_west_virginia_allegheny_plateau_context',
  'usgs_new_hampshire_white_mountains_context',
  'usgs_louisiana_kisatchie_piney_woods_context',
  'usgs_north_dakota_badlands_context',
  'usgs_oregon_klamath_siskiyou_context',
  'usgs_california_central_sierra_inyo_context',
  'usgs_idaho_eastern_targhee_context',
  'usgs_wyoming_snowy_range_laramie_context',
  'usgs_colorado_yampa_white_river_context',
  'usgs_utah_la_sal_abajo_mountains_context',
  'usgs_new_mexico_zuni_cibola_context',
  'usgs_pennsylvania_poconos_endless_mountains_context',
  'usgs_new_york_tug_hill_adirondack_west_context',
  'usgs_new_mexico_sacramento_capitan_context',
  'usgs_colorado_grand_mesa_uncompahgre_context',
  'usgs_massachusetts_berkshires_context',
  'usgs_california_mendocino_trinity_context',
  'usgs_nevada_spring_sheep_ranges_context',
  'usgs_arizona_prescott_bradshaw_context',
  'usgs_montana_beartooth_crazies_context',
  'usgs_montana_bitterroot_sapphire_context',
  'usgs_wyoming_bighorn_mountains_context',
  'usgs_south_carolina_upstate_blue_ridge_context',
  'usgs_new_york_finger_lakes_southern_tier_context',
  'usgs_delaware_maryland_coastal_plain_context',
  'usgs_michigan_upper_peninsula_keweenaw_context',
  'usgs_vermont_green_mountains_context',
  'usgs_maine_northern_woods_context',
  'usgs_oregon_umpqua_rogue_cascades_context',
  'usgs_california_modoc_lassen_plateau_context',
  'usgs_nevada_humboldt_ruby_ranges_context',
  'usgs_arizona_kaibab_coconino_plateaus_context',
  'usgs_new_mexico_jemez_chama_context',
  'usgs_colorado_sawatch_gunnison_context',
  'usgs_colorado_pikes_peak_south_park_context',
  'usgs_utah_book_cliffs_bears_ears_context',
  'usgs_idaho_clearwater_bitterroot_context',
  'usgs_idaho_magic_valley_south_hills_context',
  'usgs_montana_kootenai_cabinet_context',
  'usgs_maryland_pennsylvania_ridge_valley_context',
  'conus_empty_control',
];

assert.deepStrictEqual(
  ROUTE_CATALOG_COVERAGE_PROBES.map((probe) => probe.key),
  requiredProbeKeys,
  'Coverage audit should probe verified pilots, curation pilots, supplemental context, and an empty-control area',
);

const plan = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['tahoe_national_forest', 'michigan_dnr_orv_pilot'] });
assert.strictEqual(plan.length, 2, 'Coverage audit plan should filter by requested probe key');

for (const probe of plan) {
  assert(probe.label && probe.sourceAdapter && probe.expectedPosture, `${probe.key} should describe source/posture context`);
  assert(Number.isFinite(probe.latitude), `${probe.key} should have latitude`);
  assert(Number.isFinite(probe.longitude), `${probe.key} should have longitude`);
  assert(Number.isFinite(probe.radiusMiles) && probe.radiusMiles > 0, `${probe.key} should have a positive radius`);
  assert.strictEqual(probe.requestBody.latitude, probe.latitude);
  assert.strictEqual(probe.requestBody.longitude, probe.longitude);
  assert.strictEqual(probe.requestBody.radiusMiles, probe.radiusMiles);
  assert.strictEqual(probe.requestBody.includePreviewGeometry, false);
  assert.strictEqual(probe.requestBody.includeGeometry, false);
  assert.strictEqual(probe.requestBody.limit, 10);
}

const sierraProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'usgs_nps_sierra_context');
assert(sierraProbe.radiusMiles <= 75, 'Supplemental Sierra context probe should not overlap Tahoe verified MVUM coverage');
for (const key of [
  'usgs_mojave_death_valley_desert_context',
  'usgs_moab_canyonlands_desert_context',
  'usgs_grand_canyon_arizona_strip_context',
  'usgs_great_basin_mountains_context',
  'usgs_san_juan_mountains_context',
  'usgs_black_rock_high_rock_desert_context',
  'usgs_pacific_northwest_cascades_context',
  'usgs_oregon_high_desert_context',
  'usgs_idaho_sawtooth_boise_context',
  'usgs_montana_northern_rockies_context',
  'usgs_wyoming_wind_river_absaroka_context',
  'usgs_colorado_front_range_high_country_context',
  'usgs_arizona_sky_islands_sonoran_context',
  'usgs_new_mexico_gila_sacramento_context',
  'usgs_ozark_ouachita_highlands_context',
  'usgs_southern_appalachians_context',
  'usgs_upper_great_lakes_northwoods_context',
  'usgs_northern_new_england_appalachians_context',
  'usgs_california_north_coast_klamath_context',
  'usgs_southern_california_mountains_desert_context',
  'usgs_nevada_central_basin_ranges_context',
  'usgs_uinta_wasatch_mountains_context',
  'usgs_yellowstone_teton_absaroka_context',
  'usgs_dakota_badlands_missouri_breaks_context',
  'usgs_southeast_piney_woods_context',
  'usgs_florida_sandhills_swamps_context',
  'usgs_adirondack_northern_new_york_context',
  'usgs_pennsylvania_alleghenies_context',
  'usgs_alaska_southcentral_mountains_context',
  'usgs_hawaii_volcanic_highlands_context',
  'usgs_appalachian_plateau_coalfields_context',
  'usgs_olympic_peninsula_coast_ranges_context',
  'usgs_washington_columbia_plateau_context',
  'usgs_oregon_coast_range_context',
  'usgs_arizona_mogollon_rim_context',
  'usgs_wyoming_bighorn_powder_context',
  'usgs_nebraska_sandhills_pine_ridge_context',
  'usgs_missouri_ozark_highlands_context',
  'usgs_central_appalachians_monongahela_context',
  'usgs_new_jersey_pine_barrens_context',
  'usgs_lower_michigan_state_forests_context',
  'usgs_utah_dixie_bryce_plateaus_context',
  'usgs_alaska_southeast_tongass_context',
  'usgs_idaho_panhandle_selkirks_context',
  'usgs_south_dakota_black_hills_context',
  'usgs_georgia_alabama_piedmont_context',
  'usgs_alabama_talladega_bankhead_context',
  'usgs_mississippi_delta_hills_context',
  'usgs_kentucky_cumberland_plateau_context',
  'usgs_ohio_wayne_appalachian_foothills_context',
  'usgs_alaska_kenai_chugach_context',
  'usgs_arkansas_boston_ouachita_context',
  'usgs_wisconsin_northwoods_context',
  'usgs_minnesota_iron_range_arrowhead_context',
  'usgs_north_carolina_pisgah_nantahala_context',
  'usgs_oregon_blue_mountains_context',
  'usgs_washington_okanogan_highlands_context',
  'usgs_montana_prairie_breaks_context',
  'usgs_wyoming_red_desert_south_pass_context',
  'usgs_utah_west_desert_san_rafael_context',
  'usgs_colorado_san_luis_sangre_de_cristo_context',
  'usgs_tennessee_cumberland_highlands_context',
  'usgs_virginia_blue_ridge_context',
  'usgs_west_virginia_allegheny_plateau_context',
  'usgs_new_hampshire_white_mountains_context',
  'usgs_louisiana_kisatchie_piney_woods_context',
  'usgs_north_dakota_badlands_context',
  'usgs_oregon_klamath_siskiyou_context',
  'usgs_california_central_sierra_inyo_context',
  'usgs_idaho_eastern_targhee_context',
  'usgs_wyoming_snowy_range_laramie_context',
  'usgs_colorado_yampa_white_river_context',
  'usgs_utah_la_sal_abajo_mountains_context',
  'usgs_new_mexico_zuni_cibola_context',
  'usgs_pennsylvania_poconos_endless_mountains_context',
  'usgs_new_york_tug_hill_adirondack_west_context',
  'usgs_new_mexico_sacramento_capitan_context',
  'usgs_colorado_grand_mesa_uncompahgre_context',
  'usgs_massachusetts_berkshires_context',
  'usgs_california_mendocino_trinity_context',
  'usgs_nevada_spring_sheep_ranges_context',
  'usgs_arizona_prescott_bradshaw_context',
  'usgs_montana_beartooth_crazies_context',
  'usgs_montana_bitterroot_sapphire_context',
  'usgs_wyoming_bighorn_mountains_context',
  'usgs_south_carolina_upstate_blue_ridge_context',
  'usgs_new_york_finger_lakes_southern_tier_context',
  'usgs_delaware_maryland_coastal_plain_context',
  'usgs_michigan_upper_peninsula_keweenaw_context',
  'usgs_vermont_green_mountains_context',
  'usgs_maine_northern_woods_context',
  'usgs_oregon_umpqua_rogue_cascades_context',
  'usgs_california_modoc_lassen_plateau_context',
  'usgs_nevada_humboldt_ruby_ranges_context',
  'usgs_arizona_kaibab_coconino_plateaus_context',
  'usgs_new_mexico_jemez_chama_context',
  'usgs_colorado_sawatch_gunnison_context',
  'usgs_colorado_pikes_peak_south_park_context',
  'usgs_utah_book_cliffs_bears_ears_context',
  'usgs_idaho_clearwater_bitterroot_context',
  'usgs_idaho_magic_valley_south_hills_context',
  'usgs_montana_kootenai_cabinet_context',
  'usgs_maryland_pennsylvania_ridge_valley_context',
]) {
  const probe = ROUTE_CATALOG_COVERAGE_PROBES.find((candidate) => candidate.key === key);
  assert(probe, `Coverage audit should include ${key}`);
  assert.strictEqual(probe.expectedPosture, 'supplemental_context_only');
  assert.strictEqual(probe.sourceAdapter, 'usgs_digital_trails');
}

const verifiedSummary = summarizeSearchResponse(ROUTE_CATALOG_COVERAGE_PROBES[0], {
  count: 3,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 12, curationCandidateCount: 0, anySourceBackedCandidateCount: 12 },
  records: [{ public_id: 'verified-1', name: 'Verified Route', confidence_score: 92 }],
});
assert.strictEqual(verifiedSummary.observedPosture, 'verified_public_recommendations');
assert.strictEqual(verifiedSummary.matchesExpectedPosture, true);

const michiganProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'michigan_dnr_orv_pilot');
const michiganTomahawkKalkaskaProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'michigan_dnr_orv_tomahawk_kalkaska');
const michiganMissaukeeJunctionProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'michigan_dnr_orv_missaukee_junction');
const michiganGrandTraverseProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'michigan_dnr_orv_grand_traverse');
const minnesotaProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'minnesota_dnr_ohv_pilot');
const minnesotaProspectorsProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'minnesota_dnr_ohv_prospectors');
const minnesotaFourtownGryglaProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'minnesota_dnr_ohv_fourtown_grygla');
const minnesotaVoyageurCountryProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'minnesota_dnr_ohv_voyageur_country');
const oregonProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'oregon_odf_ohv_pilot');
const oregonClassIProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'oregon_odf_tillamook_class_i');
const oregonClassIiIvProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'oregon_odf_tillamook_class_ii_iv');
const oregonClassIiiProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'oregon_odf_tillamook_class_iii');
const coloradoCpwProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_designated_trails_pilot');
const coloradoBockmanProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_bockman_road');
const coloradoMendenhallProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_mendenhall_road');
const coloradoDiamondPeaksProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_diamond_peaks');
const coloradoGouldMountainProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_gould_mountain_road');
const coloradoMontgomeryPassProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_montgomery_pass_west');
const coloradoBullMountainProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_bull_mountain_road');
const coloradoGovernmentCreekProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_government_creek_road');
const coloradoLittleGovernmentCreekProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_little_government_creek_road');
const coloradoKiwiProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_kiwi_road');
const coloradoCusterDrawProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_custer_draw_road');
const coloradoSouthCanadianProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_south_canadian_road');
const coloradoRubyJewelProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_ruby_jewel_road');
const coloradoGrassCreekProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_grass_creek');
const coloradoAmericanLakesAccessProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_american_lakes_access');
const coloradoUpperCragsBasinProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_upper_crags_basin_access');
const coloradoDryGulchProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_dry_gulch_road');
const coloradoSilverCreekAccessProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_silver_creek_access');
const coloradoAmericanLakesTrailProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_american_lakes_trail');
const coloradoSweitzerProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_sweitzer_trail');
const coloradoSnowmobileConnectorProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_snowmobile_connector');
const coloradoHorseshoeProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_horseshoe_trail');
const coloradoOldFulfordProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_old_fulford_road');
const coloradoSouthShoreOhvProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'colorado_cpw_south_shore_ohv_track');
const utahSgidSanJuanProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'utah_sgid_trails_san_juan');
const arizonaStateParksGilaProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'arizona_state_parks_trails_gila');
const beaverheadDeerlodgeProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'beaverhead_deerlodge_national_forest');
const chugachProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'chugach_national_forest');
const modocProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'modoc_national_forest');
const tongassProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'tongass_national_forest');
const npsProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_joshua_tree');
const npsBigSouthForkProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_big_south_fork');
const npsShenandoahProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_shenandoah');
const npsEvergladesProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_everglades');
const npsTimucuanProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_timucuan');
const npsChannelIslandsProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_channel_islands');
const npsDenaliProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_denali');
const npsWrangellProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_wrangell_st_elias');
const npsGlacierBayProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_glacier_bay');
const npsKlondikeProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_klondike_gold_rush');
const npsLakeClarkProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_lake_clark');
const npsYukonCharleyProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_yukon_charley');
const npsKalokoProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_kaloko_honokohau');
const npsAmericanSamoaProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_american_samoa');
const npsWarInThePacificProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'nps_public_trails_war_in_the_pacific');
assert.strictEqual(michiganProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(michiganTomahawkKalkaskaProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(michiganMissaukeeJunctionProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(michiganGrandTraverseProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(michiganTomahawkKalkaskaProbe.requiresSourceMatch, true, 'Michigan regional ORV audit should require Michigan DNR-sourced public routes');
assert.strictEqual(michiganMissaukeeJunctionProbe.requiresSourceMatch, true, 'Michigan regional ORV audit should require Michigan DNR-sourced public routes');
assert.strictEqual(michiganGrandTraverseProbe.requiresSourceMatch, true, 'Michigan regional ORV audit should require Michigan DNR-sourced public routes');
assert.strictEqual(minnesotaProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(minnesotaProspectorsProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(minnesotaFourtownGryglaProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(minnesotaVoyageurCountryProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(minnesotaProspectorsProbe.requiresSourceMatch, true, 'Minnesota regional OHV audit should require Minnesota-sourced public routes');
assert.strictEqual(minnesotaFourtownGryglaProbe.requiresSourceMatch, true, 'Minnesota regional OHV audit should require Minnesota-sourced public routes');
assert.strictEqual(minnesotaVoyageurCountryProbe.requiresSourceMatch, true, 'Minnesota regional OHV audit should require Minnesota-sourced public routes');
assert.strictEqual(oregonProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(oregonClassIProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(oregonClassIiIvProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(oregonClassIiiProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(oregonClassIProbe.requiresSourceMatch, true, 'Oregon class OHV audit should require Oregon ODF-sourced public routes');
assert.strictEqual(oregonClassIiIvProbe.requiresSourceMatch, true, 'Oregon class OHV audit should require Oregon ODF-sourced public routes');
assert.strictEqual(oregonClassIiiProbe.requiresSourceMatch, true, 'Oregon class OHV audit should require Oregon ODF-sourced public routes');
assert.strictEqual(coloradoCpwProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoBockmanProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoMendenhallProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoDiamondPeaksProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoGouldMountainProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoMontgomeryPassProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoBullMountainProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoGovernmentCreekProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoLittleGovernmentCreekProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoKiwiProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoCusterDrawProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoSouthCanadianProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoRubyJewelProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoGrassCreekProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoAmericanLakesAccessProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoUpperCragsBasinProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoDryGulchProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoSilverCreekAccessProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoAmericanLakesTrailProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoSweitzerProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoSnowmobileConnectorProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoHorseshoeProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoOldFulfordProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoSouthShoreOhvProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(utahSgidSanJuanProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(arizonaStateParksGilaProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoCpwProbe.requiresSourceMatch, true, 'Colorado CPW audit should require CPW-sourced public routes');
assert.strictEqual(coloradoBockmanProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoMendenhallProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoDiamondPeaksProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoGouldMountainProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoMontgomeryPassProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoBullMountainProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoGovernmentCreekProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoLittleGovernmentCreekProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoKiwiProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoCusterDrawProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoSouthCanadianProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoRubyJewelProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoGrassCreekProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoAmericanLakesAccessProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoUpperCragsBasinProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoDryGulchProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoSilverCreekAccessProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoAmericanLakesTrailProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoSweitzerProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoSnowmobileConnectorProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoHorseshoeProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoOldFulfordProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(coloradoSouthShoreOhvProbe.requiresSourceMatch, true, 'Colorado CPW route audit should require CPW-sourced public routes');
assert.strictEqual(utahSgidSanJuanProbe.requiresSourceMatch, true, 'Utah SGID route audit should require Utah-sourced public routes');
assert.strictEqual(arizonaStateParksGilaProbe.requiresSourceMatch, true, 'Arizona State Parks route audit should require Arizona-sourced public routes');
assert.strictEqual(beaverheadDeerlodgeProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(chugachProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(modocProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(tongassProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(chugachProbe.sourceAdapter, 'usfs_mvum');
assert.strictEqual(tongassProbe.sourceAdapter, 'usfs_mvum');
assert.strictEqual(npsProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsBigSouthForkProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsShenandoahProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsEvergladesProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsTimucuanProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsChannelIslandsProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsDenaliProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsWrangellProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsGlacierBayProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsKlondikeProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsLakeClarkProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsYukonCharleyProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsKalokoProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsAmericanSamoaProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsWarInThePacificProbe.expectedPosture, 'verified_public_recommendations');
assert.strictEqual(npsBigSouthForkProbe.requiresSourceMatch, true, 'NPS expansion probes should require NPS-sourced public routes');
assert.strictEqual(npsEvergladesProbe.requiresSourceMatch, true, 'NPS lower-48 expansion probes should require NPS-sourced public routes');
assert.strictEqual(npsChannelIslandsProbe.requiresSourceMatch, true, 'NPS lower-48 expansion probes should require NPS-sourced public routes');
assert.strictEqual(npsWrangellProbe.requiresSourceMatch, true, 'NPS Alaska expansion probes should require NPS-sourced public routes');
assert.strictEqual(npsGlacierBayProbe.requiresSourceMatch, true, 'NPS Alaska expansion probes should require NPS-sourced public routes');
assert.strictEqual(npsYukonCharleyProbe.requiresSourceMatch, true, 'NPS Alaska expansion probes should require NPS-sourced public routes');
assert.strictEqual(npsKalokoProbe.requiresSourceMatch, true, 'NPS island and territory expansion probes should require NPS-sourced public routes');
assert.strictEqual(npsWarInThePacificProbe.requiresSourceMatch, true, 'NPS island and territory expansion probes should require NPS-sourced public routes');

const coloradoCpwPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_designated_trails_pilot'] })[0];
assert.strictEqual(
  coloradoCpwPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW audit should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoCpwPlanProbe.requestBody.limit, 25, 'Colorado CPW audit should use a bounded source-filtered result window');

const coloradoBockmanPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_bockman_road'] })[0];
assert.strictEqual(
  coloradoBockmanPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW route audits should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoBockmanPlanProbe.requestBody.limit, 25, 'Colorado CPW route audits should use a bounded source-filtered result window');

const coloradoGouldMountainPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_gould_mountain_road'] })[0];
assert.strictEqual(
  coloradoGouldMountainPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW route audits should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoGouldMountainPlanProbe.requestBody.limit, 25, 'Colorado CPW route audits should use a bounded source-filtered result window');

const coloradoGovernmentCreekPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_government_creek_road'] })[0];
assert.strictEqual(
  coloradoGovernmentCreekPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW route audits should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoGovernmentCreekPlanProbe.requestBody.limit, 25, 'Colorado CPW route audits should use a bounded source-filtered result window');

const coloradoCusterDrawPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_custer_draw_road'] })[0];
assert.strictEqual(
  coloradoCusterDrawPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW route audits should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoCusterDrawPlanProbe.requestBody.limit, 25, 'Colorado CPW route audits should use a bounded source-filtered result window');

const coloradoGrassCreekPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_grass_creek'] })[0];
assert.strictEqual(
  coloradoGrassCreekPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW route audits should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoGrassCreekPlanProbe.requestBody.limit, 25, 'Colorado CPW route audits should use a bounded source-filtered result window');

const coloradoDryGulchPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_dry_gulch_road'] })[0];
assert.strictEqual(
  coloradoDryGulchPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW route audits should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoDryGulchPlanProbe.requestBody.limit, 25, 'Colorado CPW route audits should use a bounded source-filtered result window');

const coloradoSweitzerPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_sweitzer_trail'] })[0];
assert.strictEqual(
  coloradoSweitzerPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW route audits should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoSweitzerPlanProbe.requestBody.limit, 25, 'Colorado CPW route audits should use a bounded source-filtered result window');

const coloradoOldFulfordPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['colorado_cpw_old_fulford_road'] })[0];
assert.strictEqual(
  coloradoOldFulfordPlanProbe.requestBody.sourceAdapter,
  'colorado_cpw_designated_trails',
  'Colorado CPW route audits should ask search for CPW-sourced public routes',
);
assert.strictEqual(coloradoOldFulfordPlanProbe.requestBody.limit, 25, 'Colorado CPW route audits should use a bounded source-filtered result window');

const utahSgidSanJuanPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['utah_sgid_trails_san_juan'] })[0];
assert.strictEqual(
  utahSgidSanJuanPlanProbe.requestBody.sourceAdapter,
  'utah_sgid_trails',
  'Utah SGID route audits should ask search for Utah-sourced public routes',
);
assert.strictEqual(utahSgidSanJuanPlanProbe.requestBody.limit, 25, 'Utah SGID route audits should use a bounded source-filtered result window');

const arizonaStateParksGilaPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['arizona_state_parks_trails_gila'] })[0];
assert.strictEqual(
  arizonaStateParksGilaPlanProbe.requestBody.sourceAdapter,
  'arizona_state_parks_trails',
  'Arizona State Parks route audits should ask search for Arizona-sourced public routes',
);
assert.strictEqual(arizonaStateParksGilaPlanProbe.requestBody.limit, 25, 'Arizona State Parks route audits should use a bounded source-filtered result window');

const michiganTomahawkKalkaskaPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['michigan_dnr_orv_tomahawk_kalkaska'] })[0];
assert.strictEqual(
  michiganTomahawkKalkaskaPlanProbe.requestBody.sourceAdapter,
  'michigan_dnr_orv_gpx',
  'Michigan regional ORV audits should ask search for Michigan DNR-sourced public routes',
);
assert.strictEqual(michiganTomahawkKalkaskaPlanProbe.requestBody.limit, 25, 'Michigan regional ORV audits should use a bounded source-filtered result window');

const minnesotaProspectorsPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['minnesota_dnr_ohv_prospectors'] })[0];
assert.strictEqual(
  minnesotaProspectorsPlanProbe.requestBody.sourceAdapter,
  'minnesota_dnr_ohv_trails',
  'Minnesota regional OHV audits should ask search for Minnesota DNR-sourced public routes',
);
assert.strictEqual(minnesotaProspectorsPlanProbe.requestBody.limit, 25, 'Minnesota regional OHV audits should use a bounded source-filtered result window');

const oregonClassIiIvPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['oregon_odf_tillamook_class_ii_iv'] })[0];
assert.strictEqual(
  oregonClassIiIvPlanProbe.requestBody.sourceAdapter,
  'oregon_odf_ohv_gpx',
  'Oregon class OHV audits should ask search for Oregon ODF-sourced public routes',
);
assert.strictEqual(oregonClassIiIvPlanProbe.requestBody.limit, 25, 'Oregon class OHV audits should use a bounded source-filtered result window');

const coloradoCpwOverlappedBlmSummary = summarizeSearchResponse(coloradoCpwProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 10, curationCandidateCount: 0, anySourceBackedCandidateCount: 10 },
  records: [
    {
      public_id: 'blm-co-overlap-1',
      name: 'Nearby BLM Colorado Route',
      confidence_score: 84,
      source_records: [{ provider_id: 'blm_gtlf' }],
    },
  ],
});
assert.strictEqual(coloradoCpwOverlappedBlmSummary.observedPosture, 'no_verified_routes_expected');
assert.strictEqual(
  coloradoCpwOverlappedBlmSummary.matchesExpectedPosture,
  false,
  'Colorado CPW should not pass from overlapping BLM verified routes alone.',
);
assert.strictEqual(coloradoCpwOverlappedBlmSummary.sourceMatchedPublicRecommendationCount, 0);

const coloradoCpwSourceMatchedSummary = summarizeSearchResponse(coloradoCpwProbe, {
  count: 4,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 4, curationCandidateCount: 0, anySourceBackedCandidateCount: 4 },
  records: [
    {
      public_id: 'colorado-cpw-designated-trail-bull-mountain-road-feature-83',
      name: 'Colorado CPW Designated Trail Bull Mountain Road',
      confidence_score: 83,
      source_records: [{ provider_id: 'colorado_cpw_designated_trails' }],
    },
  ],
});
assert.strictEqual(coloradoCpwSourceMatchedSummary.observedPosture, 'verified_public_recommendations');
assert.strictEqual(coloradoCpwSourceMatchedSummary.matchesExpectedPosture, true);
assert.strictEqual(coloradoCpwSourceMatchedSummary.sourceMatchedPublicRecommendationCount, 1);

const blmWyProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'blm_wy_gtlf');
const blmAkProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'blm_ak_gtlf');
const blmAkPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['blm_ak_gtlf'] })[0];
const blmAggregateProbeKeys = [
  'blm_ak_gtlf',
  'blm_az_gtlf',
  'blm_ca_nv_pilot',
  'blm_co_gtlf',
  'blm_id_gtlf',
  'blm_mt_gtlf',
  'blm_nm_gtlf',
  'blm_ut_gtlf',
  'blm_wy_gtlf',
];
const blmNmRouteProbeKeys = [
  'blm_nm_taos_punche_valley_road',
  'blm_nm_taos_sure_shot',
  'blm_nm_taos_pinabetoso_peaks_road',
  'blm_nm_quebradas_road',
  'blm_nm_angel_peak_loop_road',
];
const blmUtRouteProbeKeys = [
  'blm_ut_smoky_mountain_alvey_wash',
  'blm_ut_wolverine_loop_road',
  'blm_ut_heads_of_the_creeks_road',
  'blm_ut_horse_mountain_road',
  'blm_ut_fourmile_bench',
  'blm_ut_paria_breaks',
];
const blmNmRoutePlan = buildRouteCatalogCoverageAuditPlan({ probeKeys: blmNmRouteProbeKeys });
const blmUtRoutePlan = buildRouteCatalogCoverageAuditPlan({ probeKeys: blmUtRouteProbeKeys });
const blmWyPlanProbe = buildRouteCatalogCoverageAuditPlan({ probeKeys: ['blm_wy_gtlf'] })[0];
const blmAggregatePlan = buildRouteCatalogCoverageAuditPlan({ probeKeys: blmAggregateProbeKeys });
assert.strictEqual(
  blmAkProbe.expectedPosture,
  'verified_public_recommendations',
  'BLM Alaska should audit public aggregate recommendations after sync',
);
assert.strictEqual(blmAkProbe.requiresSourceMatch, true, 'BLM Alaska audit should require BLM-sourced public routes');
assert.strictEqual(
  blmAkPlanProbe.requestBody.sourceAdapter,
  'blm_gtlf',
  'BLM Alaska audit should source-filter to BLM GTLF records',
);
assert.strictEqual(
  blmWyProbe.expectedPosture,
  'verified_public_recommendations',
  'BLM Wyoming should audit public aggregate recommendations after sync',
);
assert.strictEqual(blmWyProbe.requiresSourceMatch, true, 'BLM Wyoming audit should require BLM-sourced public routes');
assert.strictEqual(blmWyPlanProbe.requestBody.sourceAdapter, 'blm_gtlf', 'BLM Wyoming audit should ask search for BLM-sourced public routes');
assert.strictEqual(blmWyPlanProbe.requestBody.limit, 50, 'BLM Wyoming audit should use a bounded source-filtered result window');

for (const aggregateProbe of blmAggregatePlan) {
  assert.strictEqual(
    aggregateProbe.requiresSourceMatch,
    true,
    `${aggregateProbe.key} should not pass coverage audit on overlapping non-BLM route recommendations`,
  );
  assert.strictEqual(
    aggregateProbe.requestBody.sourceAdapter,
    'blm_gtlf',
    `${aggregateProbe.key} audit should source-filter to BLM GTLF records`,
  );
}

for (const routeProbe of blmNmRoutePlan) {
  assert.strictEqual(
    routeProbe.expectedPosture,
    'verified_public_recommendations',
    `${routeProbe.key} should audit BLM GTLF New Mexico public aggregate recommendations after sync`,
  );
  assert.strictEqual(routeProbe.requiresSourceMatch, true, `${routeProbe.key} should require BLM-sourced public routes`);
  assert.strictEqual(
    routeProbe.requestBody.sourceAdapter,
    'blm_gtlf',
    `${routeProbe.key} audit should ask search for BLM-sourced public routes`,
  );
  assert.strictEqual(routeProbe.requestBody.limit, 25, `${routeProbe.key} should use a compact source-filtered result window`);
}

for (const routeProbe of blmUtRoutePlan) {
  assert.strictEqual(
    routeProbe.expectedPosture,
    'verified_public_recommendations',
    `${routeProbe.key} should audit BLM GTLF public aggregate recommendations after sync`,
  );
  assert.strictEqual(routeProbe.requiresSourceMatch, true, `${routeProbe.key} should require BLM-sourced public routes`);
  assert.strictEqual(
    routeProbe.requestBody.sourceAdapter,
    'blm_gtlf',
    `${routeProbe.key} audit should ask search for BLM-sourced public routes`,
  );
  assert.strictEqual(routeProbe.requestBody.limit, 25, `${routeProbe.key} should use a compact source-filtered result window`);
}

const blmWyOverlappedUsfsSummary = summarizeSearchResponse(blmWyProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 225, curationCandidateCount: 250, anySourceBackedCandidateCount: 475 },
  records: [
    {
      public_id: 'usfs-overlap-1',
      name: 'Nearby USFS Route',
      confidence_score: 92,
      source_records: [{ provider_id: 'usfs_mvum_bighorn_nf' }],
    },
  ],
});
assert.strictEqual(blmWyOverlappedUsfsSummary.observedPosture, 'source_backed_curation_only');
assert.strictEqual(
  blmWyOverlappedUsfsSummary.matchesExpectedPosture,
  false,
  'BLM Wyoming should not pass from overlapping USFS verified routes alone.',
);
assert.strictEqual(blmWyOverlappedUsfsSummary.sourceMatchedPublicRecommendationCount, 0);

const blmWySourceMatchedSummary = summarizeSearchResponse(blmWyProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 225, curationCandidateCount: 250, anySourceBackedCandidateCount: 475 },
  records: [
    {
      public_id: 'blm-gtlf-wy-road-segment-77001',
      name: 'BLM Road GTLF Segment',
      confidence_score: 84,
      source_records: [{ provider_id: 'blm_gtlf' }],
    },
  ],
});
assert.strictEqual(blmWySourceMatchedSummary.observedPosture, 'verified_public_recommendations');
assert.strictEqual(blmWySourceMatchedSummary.matchesExpectedPosture, true);
assert.strictEqual(blmWySourceMatchedSummary.sourceMatchedPublicRecommendationCount, 1);

const blmWyCurationOnlySummary = summarizeSearchResponse(blmWyProbe, {
  count: 0,
  coverageState: { state: 'lower_confidence_nearby', title: 'Source-backed routes in curation' },
  meta: { radiusMatchedCount: 0, curationCandidateCount: 7, anySourceBackedCandidateCount: 7 },
  records: [],
});
assert.strictEqual(blmWyCurationOnlySummary.observedPosture, 'source_backed_curation_only');
assert.strictEqual(
  blmWyCurationOnlySummary.matchesExpectedPosture,
  false,
  'BLM Wyoming should no longer pass the audit as curation-only.',
);

const mismatchSummary = summarizeSearchResponse(blmWyProbe, {
  count: 0,
  coverageState: { state: 'no_verified_routes', title: 'No verified routes yet in this area' },
  meta: { radiusMatchedCount: 0, curationCandidateCount: 0, anySourceBackedCandidateCount: 0 },
  records: [],
});
assert.strictEqual(mismatchSummary.observedPosture, 'no_verified_routes_expected');
assert.strictEqual(mismatchSummary.matchesExpectedPosture, false);

const auditFailureSummary = summarizeAuditProbeError(
  ROUTE_CATALOG_COVERAGE_PROBES[0],
  new Error('route-catalog-search timeout'),
);
assert.strictEqual(
  auditFailureSummary.observedPosture,
  'audit_error',
  'Coverage audit should record live endpoint failures as structured audit errors',
);
assert.strictEqual(auditFailureSummary.coverageState, 'audit_error');
assert.strictEqual(auditFailureSummary.matchesExpectedPosture, false);
assert.strictEqual(auditFailureSummary.error, 'route-catalog-search timeout');
assert.strictEqual(auditFailureSummary.sampleRoutes.length, 0);
assert.strictEqual(
  isRetryableAuditError(new Error('Verified route catalog is temporarily unavailable.')),
  true,
  'Coverage audit should retry transient route-catalog-search availability failures',
);
assert.strictEqual(
  isRetryableAuditError(new Error('Missing ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL')),
  false,
  'Coverage audit should not retry local configuration failures',
);

const supplementalOverlapSummary = summarizeSearchResponse(sierraProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 10, curationCandidateCount: 0, anySourceBackedCandidateCount: 483 },
  records: [{ public_id: 'verified-sierra-1', name: 'Verified Sierra Route', confidence_score: 92 }],
});
assert.strictEqual(
  supplementalOverlapSummary.observedPosture,
  'verified_public_recommendations',
  'Supplemental context probes should still report verified public routes when official MVUM coverage overlaps.',
);
assert.strictEqual(
  supplementalOverlapSummary.matchesExpectedPosture,
  true,
  'Supplemental context probes should pass when source-backed context exists even if verified public recommendations also exist nearby.',
);

const supplementalWithoutContextSummary = summarizeSearchResponse(sierraProbe, {
  count: 10,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 10, curationCandidateCount: 0, anySourceBackedCandidateCount: 0 },
  records: [{ public_id: 'verified-only-1', name: 'Verified Route Only', confidence_score: 92 }],
});
assert.strictEqual(
  supplementalWithoutContextSummary.matchesExpectedPosture,
  false,
  'Supplemental context probes should not pass on verified public routes alone when no source-backed context is present.',
);

const promotedOverlapSummary = summarizeSearchResponse(oregonProbe, {
  count: 4,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 4, curationCandidateCount: 43, anySourceBackedCandidateCount: 47 },
  records: [{ public_id: 'verified-willamette-1', name: 'Verified Willamette Route', confidence_score: 92 }],
});
assert.strictEqual(
  promotedOverlapSummary.observedPosture,
  'verified_public_recommendations',
  'Promoted state probes should report verified public routes when official recommendations are nearby.',
);
assert.strictEqual(
  promotedOverlapSummary.matchesExpectedPosture,
  true,
  'Promoted state probes should pass when verified public recommendations exist.',
);

const promotedWithoutCurationCandidatesSummary = summarizeSearchResponse(oregonProbe, {
  count: 4,
  coverageState: { state: 'ready', title: 'Verified routes available' },
  meta: { radiusMatchedCount: 4, curationCandidateCount: 0, anySourceBackedCandidateCount: 4 },
  records: [{ public_id: 'verified-only-2', name: 'Verified Route Only', confidence_score: 92 }],
});
assert.strictEqual(
  promotedWithoutCurationCandidatesSummary.matchesExpectedPosture,
  true,
  'Promoted state probes should pass on nearby verified routes even when no curation-only candidates remain.',
);

const blmProbe = ROUTE_CATALOG_COVERAGE_PROBES.find((probe) => probe.key === 'blm_ca_nv_pilot');
assert.strictEqual(
  blmProbe.expectedPosture,
  'verified_public_recommendations',
  'BLM CA/NV pilot should audit public aggregate recommendations after sync',
);

const auditSource = fs.readFileSync(auditPath, 'utf8');
for (const required of [
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  '/functions/v1/route-catalog-search',
  'coverageState',
  'radiusMatchedCount',
  'curationCandidateCount',
  'anySourceBackedCandidateCount',
  '--dry-run',
  '--probe',
  '--all',
  'summarizeAuditProbeError',
  'isRetryableAuditError',
  'ROUTE_CATALOG_AUDIT_RETRY_ATTEMPTS',
  'auditErrors',
]) {
  assert(auditSource.includes(required), `Coverage audit script should include ${required}`);
}

console.log('Route catalog coverage audit checks passed');

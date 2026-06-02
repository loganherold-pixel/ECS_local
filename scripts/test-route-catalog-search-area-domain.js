const assert = require('assert');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function compileTypescript(module, filename) {
  const source = require('fs').readFileSync(filename, 'utf8');
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
  ROUTE_CATALOG_COVERAGE_AREAS,
  ROUTE_CATALOG_CURATION_COVERAGE_LABELS,
  ROUTE_CATALOG_VERIFIED_COVERAGE_LABELS,
  ROUTE_CATALOG_PRESET_SEARCH_AREAS,
  buildManualRouteCatalogSearchArea,
  getRouteCatalogCoverageSummary,
  getRouteCatalogCoverageNotice,
  isRouteCatalogCoordinateInConus,
  parseRouteCatalogCoordinateText,
} = require(path.join(root, 'lib', 'explore', 'routeCatalogSearchArea.ts'));

assert(
  ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'tahoe_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'mendocino_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'san_juan_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'coconino_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'manti_la_sal_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'sawtooth_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'deschutes_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'kaibab_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'prescott_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'gila_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'santa_fe_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'carson_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'rio_grande_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'gmug_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'humboldt_toiyabe_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'pike_san_isabel_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'inyo_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'plumas_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'lassen_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'shasta_trinity_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'umpqua_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'fremont_winema_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'idaho_panhandle_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'helena_lewis_clark_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'fishlake_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'black_hills_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'uinta_wasatch_cache_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'caribou_targhee_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'klamath_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'willamette_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'boise_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'lolo_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'salmon_challis_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'stanislaus_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'dixie_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'bitterroot_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'mt_hood_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'coronado_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'sierra_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'huron_manistee_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'ozark_st_francis_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'ottawa_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'hiawatha_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'chequamegon_nicolet_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'florida_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'ouachita_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'mark_twain_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'mississippi_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'kisatchie_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'gwj_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'francis_marion_sumter_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'texas_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'north_carolina_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'allegheny_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'cherokee_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'daniel_boone_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'rogue_siskiyou_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'medicine_bow_routt_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'kootenai_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'gifford_pinchot_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'arapaho_roosevelt_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'umatilla_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'ochoco_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'cibola_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'eldorado_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'nez_perce_clearwater_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'payette_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'superior_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'chippewa_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'sequoia_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'ashley_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'bridger_teton_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'siuslaw_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'lincoln_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'white_river_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'mt_baker_snoqualmie_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'flathead_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'olympic_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'custer_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'bighorn_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'colville_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'chattahoochee_oconee_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'nebraska_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'shoshone_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'san_bernardino_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'los_padres_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'dakota_prairie_grasslands') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'monongahela_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'land_between_lakes_nra') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'shawnee_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'cleveland_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'green_mountain_finger_lakes_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'lake_tahoe_basin_mgmt_unit') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'wayne_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'white_mountain_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'wallowa_whitman_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'hoosier_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'columbia_river_gorge_nsa') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'okanogan_wenatchee_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'six_rivers_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'tonto_nf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'michigan_orv') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'minnesota_ohv') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'oregon_odf_ohv') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_az_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_ca_nv_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_co_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_id_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_mt_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_nm_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_ut_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'nps_public_trails_joshua_tree') &&
    !ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_wy_gtlf'),
  'Route catalog presets should expose all verified public recommendation coverage areas.',
);
assert(
  ROUTE_CATALOG_PRESET_SEARCH_AREAS.every((area) => area.publicRecommendation === true),
  'Preset search chips should only be generated from public recommendation coverage areas.',
);
assert(
  ROUTE_CATALOG_COVERAGE_AREAS.every((area) =>
    area.key &&
    area.label &&
    Array.isArray(area.sourceAdapters) &&
    area.sourceAdapters.length > 0 &&
    area.coveragePosture
  ),
  'Route catalog coverage areas should be data-driven records with source adapter and posture metadata.',
);

assert.deepStrictEqual(
  parseRouteCatalogCoordinateText('39.305, -120.49'),
  { latitude: 39.305, longitude: -120.49 },
  'Manual search center parser should accept latitude, longitude text.',
);

assert.deepStrictEqual(
  parseRouteCatalogCoordinateText('lat 39.605 lon -122.835'),
  { latitude: 39.605, longitude: -122.835 },
  'Manual search center parser should tolerate labeled coordinate text.',
);

assert.strictEqual(
  parseRouteCatalogCoordinateText('Tahoe National Forest'),
  null,
  'Manual search center parser should not pretend place names are coordinates before a geocoder exists.',
);

assert.deepStrictEqual(
  ROUTE_CATALOG_VERIFIED_COVERAGE_LABELS,
  [
    'Tahoe National Forest',
    'Mendocino National Forest',
    'San Juan National Forest',
    'Coconino National Forest',
    'Manti-La Sal National Forest',
    'Sawtooth National Forest',
    'Deschutes National Forest',
    'Kaibab National Forest',
    'Prescott National Forest',
    'Gila National Forest',
    'Santa Fe National Forest',
    'Carson National Forest',
    'Rio Grande National Forest',
    'Grand Mesa, Uncompahgre and Gunnison National Forests',
    'Humboldt-Toiyabe National Forest',
    'Pike and San Isabel National Forests',
    'Inyo National Forest',
    'Plumas National Forest',
    'Lassen National Forest',
    'Shasta-Trinity National Forest',
    'Umpqua National Forest',
    'Fremont-Winema National Forest',
    'Idaho Panhandle National Forests',
    'Helena-Lewis and Clark National Forest',
    'Fishlake National Forest',
    'Black Hills National Forest',
    'Uinta-Wasatch-Cache National Forest',
    'Caribou-Targhee National Forest',
    'Klamath National Forest',
    'Willamette National Forest',
    'Boise National Forest',
    'Lolo National Forest',
    'Salmon-Challis National Forest',
    'Stanislaus National Forest',
    'Dixie National Forest',
    'Bitterroot National Forest',
    'Mt. Hood National Forest',
    'Coronado National Forest',
    'Sierra National Forest',
    'Huron-Manistee National Forest',
    'Ozark-St. Francis National Forest',
    'Ottawa National Forest',
    'Hiawatha National Forest',
    'Chequamegon-Nicolet National Forest',
    'National Forests in Florida',
    'Ouachita National Forest',
    'Mark Twain National Forest',
    'National Forests in Mississippi',
    'Kisatchie National Forest',
    'George Washington and Jefferson National Forest',
    'Francis Marion and Sumter National Forests',
    'National Forests in Texas',
    'National Forests in North Carolina',
    'Allegheny National Forest',
    'Cherokee National Forest',
    'Daniel Boone National Forest',
    'Rogue River-Siskiyou National Forests',
    'Medicine Bow-Routt National Forest',
    'Kootenai National Forest',
    'Gifford Pinchot National Forest',
    'Arapaho and Roosevelt National Forests',
    'Umatilla National Forest',
    'Ochoco National Forest',
    'Cibola National Forest',
    'Eldorado National Forest',
    'Nez Perce-Clearwater National Forest',
    'Payette National Forest',
    'Superior National Forest',
    'Chippewa National Forest',
    'Sequoia National Forest',
    'Ashley National Forest',
    'Bridger-Teton National Forest',
    'Siuslaw National Forest',
    'Lincoln National Forest',
    'White River National Forest',
    'Mt. Baker-Snoqualmie National Forest',
    'Flathead National Forest',
    'Olympic National Forest',
    'Custer National Forest',
    'Bighorn National Forest',
    'Colville National Forest',
    'Chattahoochee-Oconee National Forests',
    'Nebraska National Forest',
    'Shoshone National Forest',
    'San Bernardino National Forest',
    'Los Padres National Forest',
    'Dakota Prairie Grasslands',
    'Monongahela National Forest',
    'Land Between the Lakes National Recreation Area',
    'Shawnee National Forest',
    'Cleveland National Forest',
    'Green Mountain and Finger Lakes National Forests',
    'Lake Tahoe Basin Management Unit',
    'Wayne National Forest',
    'White Mountain National Forest',
    'Wallowa-Whitman National Forest',
    'Hoosier National Forest',
    'Columbia River Gorge National Scenic Area',
    'Okanogan-Wenatchee National Forest',
    'Six Rivers National Forest',
    'Tonto National Forest',
    'Michigan DNR ORV',
    'Minnesota DNR OHV',
    'Oregon ODF OHV',
    'BLM GTLF Arizona',
    'BLM GTLF CA/NV',
    'BLM GTLF Colorado',
    'BLM GTLF Idaho',
    'BLM GTLF Montana',
    'BLM GTLF New Mexico',
    'BLM GTLF Utah',
    'NPS Public Trails Joshua Tree',
  ],
  'Verified coverage labels should make the current public recommendation footprint explicit.',
);
assert(
  ROUTE_CATALOG_CURATION_COVERAGE_LABELS.includes('BLM GTLF Wyoming') &&
    !ROUTE_CATALOG_CURATION_COVERAGE_LABELS.includes('Michigan DNR ORV') &&
    !ROUTE_CATALOG_CURATION_COVERAGE_LABELS.includes('Minnesota DNR OHV') &&
    !ROUTE_CATALOG_CURATION_COVERAGE_LABELS.includes('Oregon ODF OHV'),
  'Coverage registry should promote official state OHV/NPS sources while leaving only unpromoted official pilots in curation.',
);
assert.match(
  getRouteCatalogCoverageSummary(),
  /Verified recommendation coverage: Tahoe National Forest, Mendocino National Forest, San Juan National Forest, Coconino National Forest, Manti-La Sal National Forest, Sawtooth National Forest, Deschutes National Forest, Kaibab National Forest, Prescott National Forest, Gila National Forest, Santa Fe National Forest, Carson National Forest, Rio Grande National Forest, Grand Mesa, Uncompahgre and Gunnison National Forests, Humboldt-Toiyabe National Forest, Pike and San Isabel National Forests, Inyo National Forest, Plumas National Forest, Lassen National Forest, Shasta-Trinity National Forest, Umpqua National Forest, Fremont-Winema National Forest, Idaho Panhandle National Forests, Helena-Lewis and Clark National Forest, Fishlake National Forest, Black Hills National Forest, Uinta-Wasatch-Cache National Forest, Caribou-Targhee National Forest, Klamath National Forest, Willamette National Forest, Boise National Forest, Lolo National Forest, Salmon-Challis National Forest, Stanislaus National Forest, Dixie National Forest, Bitterroot National Forest, Mt\. Hood National Forest, Coronado National Forest, Sierra National Forest, Huron-Manistee National Forest, Ozark-St\. Francis National Forest, Ottawa National Forest, Hiawatha National Forest, Chequamegon-Nicolet National Forest, National Forests in Florida, Ouachita National Forest, Mark Twain National Forest, National Forests in Mississippi, Kisatchie National Forest, George Washington and Jefferson National Forest, Francis Marion and Sumter National Forests, National Forests in Texas, National Forests in North Carolina, Allegheny National Forest, Cherokee National Forest, Daniel Boone National Forest, Rogue River-Siskiyou National Forests, Medicine Bow-Routt National Forest, Kootenai National Forest, Gifford Pinchot National Forest, Arapaho and Roosevelt National Forests, Umatilla National Forest, Ochoco National Forest, Cibola National Forest, Eldorado National Forest, Nez Perce-Clearwater National Forest, Payette National Forest, Superior National Forest, Chippewa National Forest, Sequoia National Forest, Ashley National Forest, Bridger-Teton National Forest, Siuslaw National Forest, Lincoln National Forest, White River National Forest, Mt\. Baker-Snoqualmie National Forest, Flathead National Forest, Olympic National Forest, Custer National Forest, Bighorn National Forest, Colville National Forest, Chattahoochee-Oconee National Forests, Nebraska National Forest, Shoshone National Forest, San Bernardino National Forest, Los Padres National Forest, Dakota Prairie Grasslands, Monongahela National Forest, Land Between the Lakes National Recreation Area, Shawnee National Forest, Cleveland National Forest, Green Mountain and Finger Lakes National Forests, Lake Tahoe Basin Management Unit, Wayne National Forest, White Mountain National Forest, Wallowa-Whitman National Forest, Hoosier National Forest, Columbia River Gorge National Scenic Area, Okanogan-Wenatchee National Forest, Six Rivers National Forest, Tonto National Forest, Michigan DNR ORV, Minnesota DNR OHV, Oregon ODF OHV, BLM GTLF Arizona, BLM GTLF CA\/NV, BLM GTLF Colorado, BLM GTLF Idaho, BLM GTLF Montana, BLM GTLF New Mexico, BLM GTLF Utah, NPS Public Trails Joshua Tree.*In curation: BLM GTLF Wyoming.*No demo routes are used/i,
  'Coverage summary should distinguish public recommendation coverage from curation coverage.',
);

assert.strictEqual(isRouteCatalogCoordinateInConus({ latitude: 39.305, longitude: -120.49 }), true);
assert.strictEqual(isRouteCatalogCoordinateInConus({ latitude: 21.3, longitude: -157.8 }), false);
assert.strictEqual(isRouteCatalogCoordinateInConus({ latitude: 61.2, longitude: -149.9 }), false);

const manualArea = buildManualRouteCatalogSearchArea({
  label: 'Moab area',
  coordinateText: '38.5733, -109.5498',
});
assert.strictEqual(manualArea.ok, true);
assert.strictEqual(manualArea.area.source, 'manual_search_center');
assert.strictEqual(manualArea.area.key, 'manual_search_center');
assert.strictEqual(manualArea.area.shortLabel, 'Moab area');
assert.strictEqual(manualArea.area.latitude, 38.5733);
assert.strictEqual(manualArea.area.longitude, -109.5498);
assert.match(
  getRouteCatalogCoverageNotice(manualArea.area),
  /Manual CONUS center.*No demo routes are used/i,
  'Manual search centers should explain that they are radius-bound searches, not verified coverage claims.',
);
assert.match(
  getRouteCatalogCoverageNotice(ROUTE_CATALOG_PRESET_SEARCH_AREAS[0]),
  /Verified recommendation coverage.*Tahoe National Forest/i,
  'Preset pilot areas should identify active verified recommendation coverage.',
);

const invalidArea = buildManualRouteCatalogSearchArea({
  label: 'Anchorage',
  coordinateText: '61.2, -149.9',
});
assert.strictEqual(invalidArea.ok, false);
assert.match(invalidArea.error, /contiguous United States/i);

console.log('Route catalog search-area domain checks passed');

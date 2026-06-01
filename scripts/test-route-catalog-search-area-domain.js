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
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_az_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_ca_nv_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_co_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_id_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_mt_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_nm_gtlf') &&
    ROUTE_CATALOG_PRESET_SEARCH_AREAS.some((area) => area.key === 'blm_ut_gtlf') &&
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
    'BLM GTLF Arizona',
    'BLM GTLF CA/NV',
    'BLM GTLF Colorado',
    'BLM GTLF Idaho',
    'BLM GTLF Montana',
    'BLM GTLF New Mexico',
    'BLM GTLF Utah',
  ],
  'Verified coverage labels should make the current public recommendation footprint explicit.',
);
assert(
  ROUTE_CATALOG_CURATION_COVERAGE_LABELS.includes('Michigan DNR ORV') &&
    ROUTE_CATALOG_CURATION_COVERAGE_LABELS.includes('Minnesota DNR OHV') &&
    ROUTE_CATALOG_CURATION_COVERAGE_LABELS.includes('Oregon ODF OHV') &&
    ROUTE_CATALOG_CURATION_COVERAGE_LABELS.includes('BLM GTLF Wyoming'),
  'Coverage registry should expose official/source-backed areas that are ingested for curation but not public recommendations yet.',
);
assert.match(
  getRouteCatalogCoverageSummary(),
  /Verified recommendation coverage: Tahoe National Forest, Mendocino National Forest, San Juan National Forest, Coconino National Forest, Manti-La Sal National Forest, Sawtooth National Forest, Deschutes National Forest, Kaibab National Forest, Prescott National Forest, Gila National Forest, Santa Fe National Forest, Carson National Forest, Rio Grande National Forest, Grand Mesa, Uncompahgre and Gunnison National Forests, Humboldt-Toiyabe National Forest, Pike and San Isabel National Forests, Inyo National Forest, Plumas National Forest, Lassen National Forest, Shasta-Trinity National Forest, Umpqua National Forest, Fremont-Winema National Forest, Idaho Panhandle National Forests, Helena-Lewis and Clark National Forest, Fishlake National Forest, Black Hills National Forest, Uinta-Wasatch-Cache National Forest, Caribou-Targhee National Forest, Klamath National Forest, Willamette National Forest, Boise National Forest, Lolo National Forest, Salmon-Challis National Forest, Stanislaus National Forest, Dixie National Forest, Bitterroot National Forest, Mt\. Hood National Forest, Coronado National Forest, Sierra National Forest, BLM GTLF Arizona, BLM GTLF CA\/NV, BLM GTLF Colorado, BLM GTLF Idaho, BLM GTLF Montana, BLM GTLF New Mexico, BLM GTLF Utah.*In curation:.*Michigan DNR ORV.*BLM GTLF Wyoming.*No demo routes are used/i,
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

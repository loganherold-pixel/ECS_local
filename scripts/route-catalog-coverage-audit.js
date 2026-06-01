#!/usr/bin/env node
const { inspect } = require('util');
const { loadRouteCatalogEnv } = require('./route-catalog-env.js');

const ROUTE_CATALOG_COVERAGE_PROBES = [
  {
    key: 'tahoe_national_forest',
    label: 'Tahoe National Forest verified MVUM pilot',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 39.25,
    longitude: -120.55,
    radiusMiles: 85,
  },
  {
    key: 'mendocino_national_forest',
    label: 'Mendocino National Forest verified MVUM pilot',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 39.6,
    longitude: -122.8,
    radiusMiles: 85,
  },
  {
    key: 'san_juan_national_forest',
    label: 'San Juan National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 37.45,
    longitude: -107.8,
    radiusMiles: 95,
  },
  {
    key: 'coconino_national_forest',
    label: 'Coconino National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 35.22,
    longitude: -111.65,
    radiusMiles: 95,
  },
  {
    key: 'manti_la_sal_national_forest',
    label: 'Manti-La Sal National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 38.55,
    longitude: -109.55,
    radiusMiles: 115,
  },
  {
    key: 'sawtooth_national_forest',
    label: 'Sawtooth National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 43.9,
    longitude: -114.8,
    radiusMiles: 105,
  },
  {
    key: 'deschutes_national_forest',
    label: 'Deschutes National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 43.9,
    longitude: -121.6,
    radiusMiles: 105,
  },
  {
    key: 'kaibab_national_forest',
    label: 'Kaibab National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 35.98,
    longitude: -112.15,
    radiusMiles: 120,
  },
  {
    key: 'prescott_national_forest',
    label: 'Prescott National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 34.64,
    longitude: -112.42,
    radiusMiles: 95,
  },
  {
    key: 'gila_national_forest',
    label: 'Gila National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 33.37,
    longitude: -108.34,
    radiusMiles: 120,
  },
  {
    key: 'santa_fe_national_forest',
    label: 'Santa Fe National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 35.88,
    longitude: -106.11,
    radiusMiles: 95,
  },
  {
    key: 'carson_national_forest',
    label: 'Carson National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 36.51,
    longitude: -106.19,
    radiusMiles: 95,
  },
  {
    key: 'rio_grande_national_forest',
    label: 'Rio Grande National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 37.72,
    longitude: -106.53,
    radiusMiles: 115,
  },
  {
    key: 'gmug_national_forests',
    label: 'Grand Mesa, Uncompahgre and Gunnison National Forests verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 38.42,
    longitude: -107.56,
    radiusMiles: 130,
  },
  {
    key: 'humboldt_toiyabe_national_forest',
    label: 'Humboldt-Toiyabe National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 38.95,
    longitude: -117.08,
    radiusMiles: 170,
  },
  {
    key: 'pike_san_isabel_national_forests',
    label: 'Pike and San Isabel National Forests verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 38.43,
    longitude: -104.05,
    radiusMiles: 150,
  },
  {
    key: 'inyo_national_forest',
    label: 'Inyo National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 37.51,
    longitude: -118.55,
    radiusMiles: 115,
  },
  {
    key: 'plumas_national_forest',
    label: 'Plumas National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 39.9,
    longitude: -120.91,
    radiusMiles: 95,
  },
  {
    key: 'lassen_national_forest',
    label: 'Lassen National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 40.32,
    longitude: -121.47,
    radiusMiles: 105,
  },
  {
    key: 'shasta_trinity_national_forest',
    label: 'Shasta-Trinity National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 40.88,
    longitude: -122.41,
    radiusMiles: 135,
  },
  {
    key: 'umpqua_national_forest',
    label: 'Umpqua National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 43.28,
    longitude: -122.59,
    radiusMiles: 105,
  },
  {
    key: 'fremont_winema_national_forest',
    label: 'Fremont-Winema National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 42.52,
    longitude: -121.05,
    radiusMiles: 135,
  },
  {
    key: 'idaho_panhandle_national_forests',
    label: 'Idaho Panhandle National Forests verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 47.94,
    longitude: -116.22,
    radiusMiles: 145,
  },
  {
    key: 'helena_lewis_clark_national_forest',
    label: 'Helena-Lewis and Clark National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 46.6,
    longitude: -111.32,
    radiusMiles: 150,
  },
  {
    key: 'fishlake_national_forest',
    label: 'Fishlake National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 38.59,
    longitude: -112.01,
    radiusMiles: 125,
  },
  {
    key: 'black_hills_national_forest',
    label: 'Black Hills National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 44.02,
    longitude: -103.77,
    radiusMiles: 105,
  },
  {
    key: 'uinta_wasatch_cache_national_forest',
    label: 'Uinta-Wasatch-Cache National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 40.51,
    longitude: -111.41,
    radiusMiles: 150,
  },
  {
    key: 'caribou_targhee_national_forest',
    label: 'Caribou-Targhee National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 43.64,
    longitude: -111.22,
    radiusMiles: 155,
  },
  {
    key: 'klamath_national_forest',
    label: 'Klamath National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 41.62,
    longitude: -123,
    radiusMiles: 130,
  },
  {
    key: 'willamette_national_forest',
    label: 'Willamette National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 44.25,
    longitude: -122.15,
    radiusMiles: 130,
  },
  {
    key: 'boise_national_forest',
    label: 'Boise National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 44.08,
    longitude: -115.56,
    radiusMiles: 130,
  },
  {
    key: 'lolo_national_forest',
    label: 'Lolo National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 47.05,
    longitude: -114.75,
    radiusMiles: 125,
  },
  {
    key: 'salmon_challis_national_forest',
    label: 'Salmon-Challis National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 45.15,
    longitude: -114,
    radiusMiles: 170,
  },
  {
    key: 'stanislaus_national_forest',
    label: 'Stanislaus National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 38.24,
    longitude: -120,
    radiusMiles: 105,
  },
  {
    key: 'dixie_national_forest',
    label: 'Dixie National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 37.7,
    longitude: -112.65,
    radiusMiles: 150,
  },
  {
    key: 'bitterroot_national_forest',
    label: 'Bitterroot National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 45.85,
    longitude: -114.1,
    radiusMiles: 120,
  },
  {
    key: 'mt_hood_national_forest',
    label: 'Mt. Hood National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 45.35,
    longitude: -121.75,
    radiusMiles: 90,
  },
  {
    key: 'coronado_national_forest',
    label: 'Coronado National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 32.36,
    longitude: -110.25,
    radiusMiles: 140,
  },
  {
    key: 'sierra_national_forest',
    label: 'Sierra National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 37.1,
    longitude: -119.2,
    radiusMiles: 115,
  },
  {
    key: 'huron_manistee_national_forest',
    label: 'Huron-Manistee National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 44.44,
    longitude: -85.84,
    radiusMiles: 115,
  },
  {
    key: 'ozark_st_francis_national_forest',
    label: 'Ozark-St. Francis National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 35.65,
    longitude: -93.35,
    radiusMiles: 135,
  },
  {
    key: 'ottawa_national_forest',
    label: 'Ottawa National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 46.45,
    longitude: -89.25,
    radiusMiles: 110,
  },
  {
    key: 'hiawatha_national_forest',
    label: 'Hiawatha National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 46.22,
    longitude: -86.65,
    radiusMiles: 110,
  },
  {
    key: 'chequamegon_nicolet_national_forest',
    label: 'Chequamegon-Nicolet National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 45.95,
    longitude: -90.55,
    radiusMiles: 130,
  },
  {
    key: 'national_forests_in_florida',
    label: 'National Forests in Florida verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 29.769,
    longitude: -83.262,
    radiusMiles: 180,
  },
  {
    key: 'ouachita_national_forest',
    label: 'Ouachita National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 34.053,
    longitude: -93.438,
    radiusMiles: 135,
  },
  {
    key: 'mark_twain_national_forest',
    label: 'Mark Twain National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 37.253,
    longitude: -91.991,
    radiusMiles: 140,
  },
  {
    key: 'national_forests_in_mississippi',
    label: 'National Forests in Mississippi verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 32.714,
    longitude: -89.931,
    radiusMiles: 210,
  },
  {
    key: 'kisatchie_national_forest',
    label: 'Kisatchie National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 31.944,
    longitude: -92.82,
    radiusMiles: 100,
  },
  {
    key: 'george_washington_jefferson_national_forest',
    label: 'George Washington and Jefferson National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 37.867,
    longitude: -80.592,
    radiusMiles: 190,
  },
  {
    key: 'francis_marion_sumter_national_forests',
    label: 'Francis Marion and Sumter National Forests verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 33.971,
    longitude: -81.396,
    radiusMiles: 150,
  },
  {
    key: 'national_forests_in_texas',
    label: 'National Forests in Texas verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 31.9,
    longitude: -95.642,
    radiusMiles: 200,
  },
  {
    key: 'national_forests_in_north_carolina',
    label: 'National Forests in North Carolina verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 35.407,
    longitude: -80.483,
    radiusMiles: 230,
  },
  {
    key: 'allegheny_national_forest',
    label: 'Allegheny National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 41.693,
    longitude: -79.015,
    radiusMiles: 65,
  },
  {
    key: 'cherokee_national_forest',
    label: 'Cherokee National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 35.814,
    longitude: -83.207,
    radiusMiles: 120,
  },
  {
    key: 'daniel_boone_national_forest',
    label: 'Daniel Boone National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 37.433,
    longitude: -84.033,
    radiusMiles: 95,
  },
  {
    key: 'rogue_river_siskiyou_national_forests',
    label: 'Rogue River-Siskiyou National Forests verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 42.514,
    longitude: -123.305,
    radiusMiles: 110,
  },
  {
    key: 'medicine_bow_routt_national_forest',
    label: 'Medicine Bow-Routt National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 42.392,
    longitude: -105.882,
    radiusMiles: 250,
  },
  {
    key: 'kootenai_national_forest',
    label: 'Kootenai National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 48.316,
    longitude: -115.412,
    radiusMiles: 95,
  },
  {
    key: 'gifford_pinchot_national_forest',
    label: 'Gifford Pinchot National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 46.316,
    longitude: -121.955,
    radiusMiles: 85,
  },
  {
    key: 'arapaho_roosevelt_national_forests',
    label: 'Arapaho and Roosevelt National Forests verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 40.312,
    longitude: -104.95,
    radiusMiles: 150,
  },
  {
    key: 'umatilla_national_forest',
    label: 'Umatilla National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 45.54,
    longitude: -118.602,
    radiusMiles: 145,
  },
  {
    key: 'ochoco_national_forest',
    label: 'Ochoco National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 44.362,
    longitude: -120.485,
    radiusMiles: 95,
  },
  {
    key: 'cibola_national_forest',
    label: 'Cibola National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 35.036,
    longitude: -104.14,
    radiusMiles: 300,
  },
  {
    key: 'eldorado_national_forest',
    label: 'Eldorado National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 38.776,
    longitude: -120.393,
    radiusMiles: 70,
  },
  {
    key: 'nez_perce_clearwater_national_forest',
    label: 'Nez Perce-Clearwater National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 46.615,
    longitude: -115.662,
    radiusMiles: 140,
  },
  {
    key: 'payette_national_forest',
    label: 'Payette National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 44.939,
    longitude: -116.086,
    radiusMiles: 110,
  },
  {
    key: 'superior_national_forest',
    label: 'Superior National Forest verified MVUM expansion',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 47.791,
    longitude: -91.567,
    radiusMiles: 140,
  },
  {
    key: 'michigan_dnr_orv_pilot',
    label: 'Michigan DNR ORV verified recommendation pilot',
    sourceAdapter: 'michigan_dnr_orv_gpx',
    expectedPosture: 'verified_public_recommendations',
    latitude: 44.98,
    longitude: -84.13,
    radiusMiles: 100,
  },
  {
    key: 'minnesota_dnr_ohv_pilot',
    label: 'Minnesota DNR OHV verified recommendation pilot',
    sourceAdapter: 'minnesota_dnr_ohv_trails',
    expectedPosture: 'verified_public_recommendations',
    latitude: 47.49,
    longitude: -92.46,
    radiusMiles: 100,
  },
  {
    key: 'oregon_odf_ohv_pilot',
    label: 'Oregon ODF Tillamook OHV verified recommendation pilot',
    sourceAdapter: 'oregon_odf_ohv_gpx',
    expectedPosture: 'verified_public_recommendations',
    latitude: 45.55,
    longitude: -123.55,
    radiusMiles: 90,
  },
  {
    key: 'blm_az_gtlf',
    label: 'BLM GTLF Arizona verified aggregate pilot',
    sourceAdapter: 'blm_gtlf',
    expectedPosture: 'verified_public_recommendations',
    latitude: 33.31,
    longitude: -111.73,
    radiusMiles: 180,
  },
  {
    key: 'blm_ca_nv_pilot',
    label: 'BLM GTLF CA/NV verified aggregate pilot',
    sourceAdapter: 'blm_gtlf',
    expectedPosture: 'verified_public_recommendations',
    latitude: 36.45,
    longitude: -116.85,
    radiusMiles: 120,
  },
  {
    key: 'blm_co_gtlf',
    label: 'BLM GTLF Colorado verified aggregate pilot',
    sourceAdapter: 'blm_gtlf',
    expectedPosture: 'verified_public_recommendations',
    latitude: 38.58,
    longitude: -105.89,
    radiusMiles: 160,
  },
  {
    key: 'blm_id_gtlf',
    label: 'BLM GTLF Idaho verified aggregate pilot',
    sourceAdapter: 'blm_gtlf',
    expectedPosture: 'verified_public_recommendations',
    latitude: 43.11,
    longitude: -116.3,
    radiusMiles: 140,
  },
  {
    key: 'blm_mt_gtlf',
    label: 'BLM GTLF Montana verified aggregate pilot',
    sourceAdapter: 'blm_gtlf',
    expectedPosture: 'verified_public_recommendations',
    latitude: 47.01,
    longitude: -109.82,
    radiusMiles: 180,
  },
  {
    key: 'blm_nm_gtlf',
    label: 'BLM GTLF New Mexico verified aggregate pilot',
    sourceAdapter: 'blm_gtlf',
    expectedPosture: 'verified_public_recommendations',
    latitude: 33.65,
    longitude: -107.37,
    radiusMiles: 220,
  },
  {
    key: 'blm_ut_gtlf',
    label: 'BLM GTLF Utah verified aggregate pilot',
    sourceAdapter: 'blm_gtlf',
    expectedPosture: 'verified_public_recommendations',
    latitude: 37.37,
    longitude: -111.78,
    radiusMiles: 140,
  },
  {
    key: 'blm_wy_gtlf',
    label: 'BLM GTLF Wyoming curation pilot',
    sourceAdapter: 'blm_gtlf',
    expectedPosture: 'source_backed_curation_only',
    latitude: 44.51,
    longitude: -107.94,
    radiusMiles: 160,
  },
  {
    key: 'nps_public_trails_joshua_tree',
    label: 'NPS public trails Joshua Tree verified recommendation pilot',
    sourceAdapter: 'nps_public_trails',
    expectedPosture: 'verified_public_recommendations',
    latitude: 34.0,
    longitude: -116.03,
    radiusMiles: 45,
  },
  {
    key: 'usgs_nps_sierra_context',
    label: 'USGS Sierra supplemental context pilot',
    sourceAdapter: 'usgs_digital_trails',
    expectedPosture: 'supplemental_context_only',
    latitude: 37.75,
    longitude: -119.6,
    radiusMiles: 60,
  },
  {
    key: 'conus_empty_control',
    label: 'CONUS empty-state control',
    sourceAdapter: 'none',
    expectedPosture: 'no_verified_routes_expected',
    latitude: 38.5,
    longitude: -98.0,
    radiusMiles: 35,
  },
];

function routeCatalogSearchUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/functions/v1/route-catalog-search`;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    all: false,
    probeKeys: [],
    json: false,
    failOnMismatch: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--fail-on-mismatch') {
      options.failOnMismatch = true;
    } else if (arg === '--probe') {
      const value = argv[index + 1];
      if (!value) throw new Error('--probe requires a coverage probe key');
      options.probeKeys.push(value);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/route-catalog-coverage-audit.js --dry-run --all',
    '  node scripts/route-catalog-coverage-audit.js --dry-run --probe tahoe_national_forest',
    '  node scripts/route-catalog-coverage-audit.js --all',
    '  node scripts/route-catalog-coverage-audit.js --all --fail-on-mismatch',
    '',
    'Required for live audit:',
    '  ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL',
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY is optional for route-catalog-search, but sent when present.',
  ].join('\n');
}

function buildRouteCatalogCoverageAuditPlan({ probeKeys = [] } = {}) {
  const requested = new Set(probeKeys);
  const probes = probeKeys.length > 0
    ? ROUTE_CATALOG_COVERAGE_PROBES.filter((probe) => requested.has(probe.key))
    : [...ROUTE_CATALOG_COVERAGE_PROBES];

  if (probeKeys.length > 0) {
    const found = new Set(probes.map((probe) => probe.key));
    const missing = probeKeys.filter((key) => !found.has(key));
    if (missing.length > 0) throw new Error(`Unknown route catalog coverage probe(s): ${missing.join(', ')}`);
  }

  return probes.map((probe) => ({
    ...probe,
    requestBody: {
      latitude: probe.latitude,
      longitude: probe.longitude,
      radiusMiles: probe.radiusMiles,
      limit: 10,
      includeGeometry: false,
      includePreviewGeometry: false,
    },
  }));
}

function resolveSupabaseUrl(env) {
  return env.ECS_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '';
}

function resolveAnonKey(env) {
  return env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
}

function headersForAudit(anonKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (anonKey) {
    headers.apikey = anonKey;
    headers.authorization = `Bearer ${anonKey}`;
  }
  return headers;
}

function summarizeSearchResponse(probe, body) {
  const meta = body && typeof body.meta === 'object' ? body.meta : {};
  const coverageState = body && typeof body.coverageState === 'object' ? body.coverageState : {};
  const records = Array.isArray(body.records) ? body.records : [];
  const count = Number(body.count || records.length || 0);
  const radiusMatchedCount = Number(meta.radiusMatchedCount || 0);
  const curationCandidateCount = Number(meta.curationCandidateCount || 0);
  const anySourceBackedCandidateCount = Number(meta.anySourceBackedCandidateCount || 0);
  const observedPosture = count > 0 && coverageState.state === 'ready'
    ? 'verified_public_recommendations'
    : curationCandidateCount > 0 || (count === 0 && anySourceBackedCandidateCount > 0)
      ? 'source_backed_curation_only'
      : 'no_verified_routes_expected';
  const supplementalContextPresent =
    probe.expectedPosture === 'supplemental_context_only' &&
    anySourceBackedCandidateCount > 0;
  const curationContextPresent =
    probe.expectedPosture === 'source_backed_curation_only' &&
    curationCandidateCount > 0;
  const matchesExpectedPosture =
    probe.expectedPosture === observedPosture ||
    (supplementalContextPresent &&
      (observedPosture === 'source_backed_curation_only' ||
        observedPosture === 'verified_public_recommendations')) ||
    (curationContextPresent &&
      (observedPosture === 'source_backed_curation_only' ||
        observedPosture === 'verified_public_recommendations'));
  return {
    key: probe.key,
    label: probe.label,
    sourceAdapter: probe.sourceAdapter,
    expectedPosture: probe.expectedPosture,
    observedPosture,
    matchesExpectedPosture,
    count,
    coverageState: coverageState.state || 'unknown',
    coverageTitle: coverageState.title || '',
    radiusMatchedCount,
    curationCandidateCount,
    anySourceBackedCandidateCount,
    sampleRoutes: records.slice(0, 3).map((record) => ({
      publicId: record.public_id || record.publicId || '',
      name: record.name || record.title || '',
      confidenceScore: record.confidence_score || record.confidenceScore || null,
      sourceConfidenceLabel: record.source_confidence_label || record.sourceConfidenceLabel || '',
    })),
  };
}

async function auditProbe(probe, env) {
  const supabaseUrl = resolveSupabaseUrl(env);
  if (!supabaseUrl) throw new Error('Missing ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');

  const response = await fetch(routeCatalogSearchUrl(supabaseUrl), {
    method: 'POST',
    headers: headersForAudit(resolveAnonKey(env)),
    body: JSON.stringify(probe.requestBody),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`${probe.key} returned non-JSON response: ${text.slice(0, 300)}`);
  }
  if (!response.ok || body.ok === false) {
    throw new Error(`${probe.key} coverage audit failed: ${body.error || response.statusText}`);
  }
  return summarizeSearchResponse(probe, body);
}

function printHumanAudit(result) {
  console.log(`${result.label}`);
  console.log(`  state: ${result.coverageState}`);
  console.log(`  observed posture: ${result.observedPosture}`);
  console.log(`  matches expected: ${result.matchesExpectedPosture ? 'yes' : 'no'}`);
  console.log(`  count: ${result.count}`);
  console.log(`  radius matches: ${result.radiusMatchedCount}`);
  console.log(`  curation candidates: ${result.curationCandidateCount}`);
  console.log(`  source-backed candidates: ${result.anySourceBackedCandidateCount}`);
}

async function main() {
  loadRouteCatalogEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.all && options.probeKeys.length === 0) {
    throw new Error(`${usage()}\n\nSelect --all or at least one --probe.`);
  }

  const plan = buildRouteCatalogCoverageAuditPlan({ probeKeys: options.all ? [] : options.probeKeys });
  if (options.dryRun) {
    const summary = {
      mode: 'dry-run',
      supabaseUrl: resolveSupabaseUrl(process.env) ? '(present)' : '(missing)',
      anonKey: resolveAnonKey(process.env) ? '(present)' : '(missing)',
      probes: plan,
    };
    console.log(options.json ? JSON.stringify(summary, null, 2) : inspect(summary, { depth: null, colors: false }));
    return;
  }

  const results = [];
  for (const probe of plan) {
    const result = await auditProbe(probe, process.env);
    results.push(result);
    if (!options.json) printHumanAudit(result);
  }
  const mismatchedProbes = results.filter((result) => !result.matchesExpectedPosture);
  if (options.json) console.log(JSON.stringify({ mode: 'live-audit', results }, null, 2));
  if (options.failOnMismatch && mismatchedProbes.length > 0) {
    console.error(
      `Route catalog coverage audit found ${mismatchedProbes.length} mismatched probe(s): ${
        mismatchedProbes.map((result) => result.key).join(', ')
      }`,
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  ROUTE_CATALOG_COVERAGE_PROBES,
  auditProbe,
  buildRouteCatalogCoverageAuditPlan,
  routeCatalogSearchUrl,
  summarizeSearchResponse,
};

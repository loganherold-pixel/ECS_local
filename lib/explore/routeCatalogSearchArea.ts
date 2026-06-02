export type RouteCatalogPresetSearchAreaKey =
  | 'tahoe_nf'
  | 'mendocino_nf'
  | 'san_juan_nf'
  | 'coconino_nf'
  | 'manti_la_sal_nf'
  | 'sawtooth_nf'
  | 'deschutes_nf'
  | 'kaibab_nf'
  | 'prescott_nf'
  | 'gila_nf'
  | 'santa_fe_nf'
  | 'carson_nf'
  | 'rio_grande_nf'
  | 'gmug_nf'
  | 'humboldt_toiyabe_nf'
  | 'pike_san_isabel_nf'
  | 'inyo_nf'
  | 'plumas_nf'
  | 'lassen_nf'
  | 'shasta_trinity_nf'
  | 'umpqua_nf'
  | 'fremont_winema_nf'
  | 'idaho_panhandle_nf'
  | 'helena_lewis_clark_nf'
  | 'fishlake_nf'
  | 'black_hills_nf'
  | 'uinta_wasatch_cache_nf'
  | 'caribou_targhee_nf'
  | 'klamath_nf'
  | 'willamette_nf'
  | 'boise_nf'
  | 'lolo_nf'
  | 'salmon_challis_nf'
  | 'stanislaus_nf'
  | 'dixie_nf'
  | 'bitterroot_nf'
  | 'mt_hood_nf'
  | 'coronado_nf'
  | 'sierra_nf'
  | 'huron_manistee_nf'
  | 'ozark_st_francis_nf'
  | 'ottawa_nf'
  | 'hiawatha_nf'
  | 'chequamegon_nicolet_nf'
  | 'florida_nf'
  | 'ouachita_nf'
  | 'mark_twain_nf'
  | 'mississippi_nf'
  | 'kisatchie_nf'
  | 'gwj_nf'
  | 'francis_marion_sumter_nf'
  | 'texas_nf'
  | 'north_carolina_nf'
  | 'allegheny_nf'
  | 'cherokee_nf'
  | 'daniel_boone_nf'
  | 'rogue_siskiyou_nf'
  | 'medicine_bow_routt_nf'
  | 'kootenai_nf'
  | 'gifford_pinchot_nf'
  | 'arapaho_roosevelt_nf'
  | 'umatilla_nf'
  | 'ochoco_nf'
  | 'cibola_nf'
  | 'eldorado_nf'
  | 'nez_perce_clearwater_nf'
  | 'payette_nf'
  | 'superior_nf'
  | 'chippewa_nf'
  | 'sequoia_nf'
  | 'ashley_nf'
  | 'bridger_teton_nf'
  | 'siuslaw_nf'
  | 'lincoln_nf'
  | 'white_river_nf'
  | 'mt_baker_snoqualmie_nf'
  | 'flathead_nf'
  | 'olympic_nf'
  | 'custer_nf'
  | 'bighorn_nf'
  | 'colville_nf'
  | 'chattahoochee_oconee_nf'
  | 'nebraska_nf'
  | 'shoshone_nf'
  | 'san_bernardino_nf'
  | 'los_padres_nf'
  | 'dakota_prairie_grasslands'
  | 'monongahela_nf'
  | 'land_between_lakes_nra'
  | 'shawnee_nf'
  | 'cleveland_nf'
  | 'green_mountain_finger_lakes_nf'
  | 'lake_tahoe_basin_mgmt_unit'
  | 'wayne_nf'
  | 'white_mountain_nf'
  | 'wallowa_whitman_nf'
  | 'hoosier_nf'
  | 'columbia_river_gorge_nsa'
  | 'okanogan_wenatchee_nf'
  | 'six_rivers_nf'
  | 'tonto_nf'
  | 'michigan_orv'
  | 'minnesota_ohv'
  | 'oregon_odf_ohv'
  | 'blm_az_gtlf'
  | 'blm_ca_nv_gtlf'
  | 'blm_co_gtlf'
  | 'blm_id_gtlf'
  | 'blm_mt_gtlf'
  | 'blm_nm_gtlf'
  | 'blm_ut_gtlf'
  | 'nps_public_trails_joshua_tree';

export type RouteCatalogSearchAreaSource = 'selected_search_area' | 'manual_search_center' | 'live_gps';
export type RouteCatalogCoveragePosture =
  | 'verified_recommendation'
  | 'official_curation'
  | 'supplemental_context';

export type RouteCatalogSearchArea = {
  key: RouteCatalogPresetSearchAreaKey | 'manual_search_center' | 'live_gps';
  label: string;
  shortLabel: string;
  latitude: number;
  longitude: number;
  source: RouteCatalogSearchAreaSource;
};

export type RouteCatalogPresetSearchArea = Omit<RouteCatalogSearchArea, 'key' | 'source'> & {
  key: RouteCatalogPresetSearchAreaKey;
  source: 'selected_search_area';
  coveragePosture: 'verified_recommendation';
  publicRecommendation: true;
  sourceAdapters: string[];
};

export type RouteCatalogCoverageArea = {
  key: string;
  label: string;
  shortLabel: string;
  latitude: number | null;
  longitude: number | null;
  coveragePosture: RouteCatalogCoveragePosture;
  publicRecommendation: boolean;
  sourceAdapters: string[];
};

export type ManualRouteCatalogSearchAreaInput = {
  label?: string | null;
  coordinateText: string;
};

export type ManualRouteCatalogSearchAreaResult =
  | { ok: true; area: RouteCatalogSearchArea }
  | { ok: false; error: string };

const CONUS_BOUNDS = {
  minLatitude: 24.396308,
  maxLatitude: 49.384358,
  minLongitude: -124.848974,
  maxLongitude: -66.885444,
};

export const ROUTE_CATALOG_COVERAGE_AREAS: RouteCatalogCoverageArea[] = [
  {
    key: 'tahoe_nf',
    label: 'Tahoe National Forest',
    shortLabel: 'Tahoe NF',
    latitude: 39.305,
    longitude: -120.49,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'mendocino_nf',
    label: 'Mendocino National Forest',
    shortLabel: 'Mendocino NF',
    latitude: 39.605,
    longitude: -122.835,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'san_juan_nf',
    label: 'San Juan National Forest',
    shortLabel: 'San Juan NF',
    latitude: 37.45,
    longitude: -107.8,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'coconino_nf',
    label: 'Coconino National Forest',
    shortLabel: 'Coconino NF',
    latitude: 35.22,
    longitude: -111.65,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'manti_la_sal_nf',
    label: 'Manti-La Sal National Forest',
    shortLabel: 'Manti-La Sal NF',
    latitude: 38.55,
    longitude: -109.55,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'sawtooth_nf',
    label: 'Sawtooth National Forest',
    shortLabel: 'Sawtooth NF',
    latitude: 43.9,
    longitude: -114.8,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'deschutes_nf',
    label: 'Deschutes National Forest',
    shortLabel: 'Deschutes NF',
    latitude: 43.9,
    longitude: -121.6,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'kaibab_nf',
    label: 'Kaibab National Forest',
    shortLabel: 'Kaibab NF',
    latitude: 35.98,
    longitude: -112.15,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'prescott_nf',
    label: 'Prescott National Forest',
    shortLabel: 'Prescott NF',
    latitude: 34.64,
    longitude: -112.42,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'gila_nf',
    label: 'Gila National Forest',
    shortLabel: 'Gila NF',
    latitude: 33.37,
    longitude: -108.34,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'santa_fe_nf',
    label: 'Santa Fe National Forest',
    shortLabel: 'Santa Fe NF',
    latitude: 35.88,
    longitude: -106.11,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'carson_nf',
    label: 'Carson National Forest',
    shortLabel: 'Carson NF',
    latitude: 36.51,
    longitude: -106.19,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'rio_grande_nf',
    label: 'Rio Grande National Forest',
    shortLabel: 'Rio Grande NF',
    latitude: 37.72,
    longitude: -106.53,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'gmug_nf',
    label: 'Grand Mesa, Uncompahgre and Gunnison National Forests',
    shortLabel: 'GMUG NF',
    latitude: 38.42,
    longitude: -107.56,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'humboldt_toiyabe_nf',
    label: 'Humboldt-Toiyabe National Forest',
    shortLabel: 'Humboldt-Toiyabe NF',
    latitude: 38.95,
    longitude: -117.08,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'pike_san_isabel_nf',
    label: 'Pike and San Isabel National Forests',
    shortLabel: 'Pike-San Isabel NF',
    latitude: 38.43,
    longitude: -104.05,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'inyo_nf',
    label: 'Inyo National Forest',
    shortLabel: 'Inyo NF',
    latitude: 37.51,
    longitude: -118.55,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'plumas_nf',
    label: 'Plumas National Forest',
    shortLabel: 'Plumas NF',
    latitude: 39.9,
    longitude: -120.91,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'lassen_nf',
    label: 'Lassen National Forest',
    shortLabel: 'Lassen NF',
    latitude: 40.32,
    longitude: -121.47,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'shasta_trinity_nf',
    label: 'Shasta-Trinity National Forest',
    shortLabel: 'Shasta-Trinity NF',
    latitude: 40.88,
    longitude: -122.41,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'umpqua_nf',
    label: 'Umpqua National Forest',
    shortLabel: 'Umpqua NF',
    latitude: 43.28,
    longitude: -122.59,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'fremont_winema_nf',
    label: 'Fremont-Winema National Forest',
    shortLabel: 'Fremont-Winema NF',
    latitude: 42.52,
    longitude: -121.05,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'idaho_panhandle_nf',
    label: 'Idaho Panhandle National Forests',
    shortLabel: 'Idaho Panhandle NF',
    latitude: 47.94,
    longitude: -116.22,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'helena_lewis_clark_nf',
    label: 'Helena-Lewis and Clark National Forest',
    shortLabel: 'Helena-Lewis Clark NF',
    latitude: 46.6,
    longitude: -111.32,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'fishlake_nf',
    label: 'Fishlake National Forest',
    shortLabel: 'Fishlake NF',
    latitude: 38.59,
    longitude: -112.01,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'black_hills_nf',
    label: 'Black Hills National Forest',
    shortLabel: 'Black Hills NF',
    latitude: 44.02,
    longitude: -103.77,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'uinta_wasatch_cache_nf',
    label: 'Uinta-Wasatch-Cache National Forest',
    shortLabel: 'Uinta-Wasatch-Cache NF',
    latitude: 40.51,
    longitude: -111.41,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'caribou_targhee_nf',
    label: 'Caribou-Targhee National Forest',
    shortLabel: 'Caribou-Targhee NF',
    latitude: 43.64,
    longitude: -111.22,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'klamath_nf',
    label: 'Klamath National Forest',
    shortLabel: 'Klamath NF',
    latitude: 41.62,
    longitude: -123,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'willamette_nf',
    label: 'Willamette National Forest',
    shortLabel: 'Willamette NF',
    latitude: 44.25,
    longitude: -122.15,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'boise_nf',
    label: 'Boise National Forest',
    shortLabel: 'Boise NF',
    latitude: 44.08,
    longitude: -115.56,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'lolo_nf',
    label: 'Lolo National Forest',
    shortLabel: 'Lolo NF',
    latitude: 47.05,
    longitude: -114.75,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'salmon_challis_nf',
    label: 'Salmon-Challis National Forest',
    shortLabel: 'Salmon-Challis NF',
    latitude: 45.15,
    longitude: -114,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'stanislaus_nf',
    label: 'Stanislaus National Forest',
    shortLabel: 'Stanislaus NF',
    latitude: 38.24,
    longitude: -120,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'dixie_nf',
    label: 'Dixie National Forest',
    shortLabel: 'Dixie NF',
    latitude: 37.7,
    longitude: -112.65,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'bitterroot_nf',
    label: 'Bitterroot National Forest',
    shortLabel: 'Bitterroot NF',
    latitude: 45.85,
    longitude: -114.1,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'mt_hood_nf',
    label: 'Mt. Hood National Forest',
    shortLabel: 'Mt. Hood NF',
    latitude: 45.35,
    longitude: -121.75,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'coronado_nf',
    label: 'Coronado National Forest',
    shortLabel: 'Coronado NF',
    latitude: 32.36,
    longitude: -110.25,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'sierra_nf',
    label: 'Sierra National Forest',
    shortLabel: 'Sierra NF',
    latitude: 37.1,
    longitude: -119.2,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'huron_manistee_nf',
    label: 'Huron-Manistee National Forest',
    shortLabel: 'Huron-Manistee NF',
    latitude: 44.44,
    longitude: -85.84,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'ozark_st_francis_nf',
    label: 'Ozark-St. Francis National Forest',
    shortLabel: 'Ozark-St. Francis NF',
    latitude: 35.65,
    longitude: -93.35,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'ottawa_nf',
    label: 'Ottawa National Forest',
    shortLabel: 'Ottawa NF',
    latitude: 46.45,
    longitude: -89.25,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'hiawatha_nf',
    label: 'Hiawatha National Forest',
    shortLabel: 'Hiawatha NF',
    latitude: 46.22,
    longitude: -86.65,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'chequamegon_nicolet_nf',
    label: 'Chequamegon-Nicolet National Forest',
    shortLabel: 'Chequamegon-Nicolet NF',
    latitude: 45.95,
    longitude: -90.55,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'florida_nf',
    label: 'National Forests in Florida',
    shortLabel: 'Florida NF',
    latitude: 29.769,
    longitude: -83.262,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'ouachita_nf',
    label: 'Ouachita National Forest',
    shortLabel: 'Ouachita NF',
    latitude: 34.053,
    longitude: -93.438,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'mark_twain_nf',
    label: 'Mark Twain National Forest',
    shortLabel: 'Mark Twain NF',
    latitude: 37.253,
    longitude: -91.991,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'mississippi_nf',
    label: 'National Forests in Mississippi',
    shortLabel: 'Mississippi NF',
    latitude: 32.714,
    longitude: -89.931,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'kisatchie_nf',
    label: 'Kisatchie National Forest',
    shortLabel: 'Kisatchie NF',
    latitude: 31.944,
    longitude: -92.82,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'gwj_nf',
    label: 'George Washington and Jefferson National Forest',
    shortLabel: 'GWJ NF',
    latitude: 37.867,
    longitude: -80.592,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'francis_marion_sumter_nf',
    label: 'Francis Marion and Sumter National Forests',
    shortLabel: 'FM-Sumter NF',
    latitude: 33.971,
    longitude: -81.396,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'texas_nf',
    label: 'National Forests in Texas',
    shortLabel: 'Texas NF',
    latitude: 31.9,
    longitude: -95.642,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'north_carolina_nf',
    label: 'National Forests in North Carolina',
    shortLabel: 'North Carolina NF',
    latitude: 35.407,
    longitude: -80.483,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'allegheny_nf',
    label: 'Allegheny National Forest',
    shortLabel: 'Allegheny NF',
    latitude: 41.693,
    longitude: -79.015,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'cherokee_nf',
    label: 'Cherokee National Forest',
    shortLabel: 'Cherokee NF',
    latitude: 35.814,
    longitude: -83.207,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'daniel_boone_nf',
    label: 'Daniel Boone National Forest',
    shortLabel: 'Daniel Boone NF',
    latitude: 37.433,
    longitude: -84.033,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'rogue_siskiyou_nf',
    label: 'Rogue River-Siskiyou National Forests',
    shortLabel: 'Rogue-Siskiyou NF',
    latitude: 42.514,
    longitude: -123.305,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'medicine_bow_routt_nf',
    label: 'Medicine Bow-Routt National Forest',
    shortLabel: 'Medicine Bow-Routt NF',
    latitude: 42.392,
    longitude: -105.882,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'kootenai_nf',
    label: 'Kootenai National Forest',
    shortLabel: 'Kootenai NF',
    latitude: 48.316,
    longitude: -115.412,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'gifford_pinchot_nf',
    label: 'Gifford Pinchot National Forest',
    shortLabel: 'Gifford Pinchot NF',
    latitude: 46.316,
    longitude: -121.955,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'arapaho_roosevelt_nf',
    label: 'Arapaho and Roosevelt National Forests',
    shortLabel: 'Arapaho-Roosevelt NF',
    latitude: 40.312,
    longitude: -104.95,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'umatilla_nf',
    label: 'Umatilla National Forest',
    shortLabel: 'Umatilla NF',
    latitude: 45.54,
    longitude: -118.602,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'ochoco_nf',
    label: 'Ochoco National Forest',
    shortLabel: 'Ochoco NF',
    latitude: 44.362,
    longitude: -120.485,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'cibola_nf',
    label: 'Cibola National Forest',
    shortLabel: 'Cibola NF',
    latitude: 35.036,
    longitude: -104.14,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'eldorado_nf',
    label: 'Eldorado National Forest',
    shortLabel: 'Eldorado NF',
    latitude: 38.776,
    longitude: -120.393,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'nez_perce_clearwater_nf',
    label: 'Nez Perce-Clearwater National Forest',
    shortLabel: 'Nez Perce-Clearwater NF',
    latitude: 46.615,
    longitude: -115.662,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'payette_nf',
    label: 'Payette National Forest',
    shortLabel: 'Payette NF',
    latitude: 44.939,
    longitude: -116.086,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'superior_nf',
    label: 'Superior National Forest',
    shortLabel: 'Superior NF',
    latitude: 47.791,
    longitude: -91.567,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'chippewa_nf',
    label: 'Chippewa National Forest',
    shortLabel: 'Chippewa NF',
    latitude: 47.412,
    longitude: -94.061,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'sequoia_nf',
    label: 'Sequoia National Forest',
    shortLabel: 'Sequoia NF',
    latitude: 36.126,
    longitude: -118.684,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'ashley_nf',
    label: 'Ashley National Forest',
    shortLabel: 'Ashley NF',
    latitude: 40.68,
    longitude: -110.151,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'bridger_teton_nf',
    label: 'Bridger-Teton National Forest',
    shortLabel: 'Bridger-Teton NF',
    latitude: 43.043,
    longitude: -109.993,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'siuslaw_nf',
    label: 'Siuslaw National Forest',
    shortLabel: 'Siuslaw NF',
    latitude: 44.389,
    longitude: -123.885,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'lincoln_nf',
    label: 'Lincoln National Forest',
    shortLabel: 'Lincoln NF',
    latitude: 32.984,
    longitude: -105.272,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'white_river_nf',
    label: 'White River National Forest',
    shortLabel: 'White River NF',
    latitude: 39.583,
    longitude: -106.881,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'mt_baker_snoqualmie_nf',
    label: 'Mt. Baker-Snoqualmie National Forest',
    shortLabel: 'Mt. Baker-Snoqualmie NF',
    latitude: 47.963,
    longitude: -121.601,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'flathead_nf',
    label: 'Flathead National Forest',
    shortLabel: 'Flathead NF',
    latitude: 48.166,
    longitude: -114.098,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'olympic_nf',
    label: 'Olympic National Forest',
    shortLabel: 'Olympic NF',
    latitude: 47.698,
    longitude: -123.65,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'custer_nf',
    label: 'Custer National Forest',
    shortLabel: 'Custer NF',
    latitude: 45.448,
    longitude: -106.613,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'bighorn_nf',
    label: 'Bighorn National Forest',
    shortLabel: 'Bighorn NF',
    latitude: 44.526,
    longitude: -107.413,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'colville_nf',
    label: 'Colville National Forest',
    shortLabel: 'Colville NF',
    latitude: 48.603,
    longitude: -117.967,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'chattahoochee_oconee_nf',
    label: 'Chattahoochee-Oconee National Forests',
    shortLabel: 'Chattahoochee-Oconee NF',
    latitude: 34.027,
    longitude: -84.226,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'nebraska_nf',
    label: 'Nebraska National Forest',
    shortLabel: 'Nebraska NF',
    latitude: 43.029,
    longitude: -102.069,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'shoshone_nf',
    label: 'Shoshone National Forest',
    shortLabel: 'Shoshone NF',
    latitude: 43.748,
    longitude: -109.38,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'san_bernardino_nf',
    label: 'San Bernardino National Forest',
    shortLabel: 'San Bernardino NF',
    latitude: 33.962,
    longitude: -117.07,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'los_padres_nf',
    label: 'Los Padres National Forest',
    shortLabel: 'Los Padres NF',
    latitude: 35.378,
    longitude: -120.341,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'dakota_prairie_grasslands',
    label: 'Dakota Prairie Grasslands',
    shortLabel: 'Dakota Prairie',
    latitude: 46.935,
    longitude: -99.883,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'monongahela_nf',
    label: 'Monongahela National Forest',
    shortLabel: 'Monongahela NF',
    latitude: 38.553,
    longitude: -79.898,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'land_between_lakes_nra',
    label: 'Land Between the Lakes National Recreation Area',
    shortLabel: 'Land Between Lakes',
    latitude: 36.75,
    longitude: -88.061,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'shawnee_nf',
    label: 'Shawnee National Forest',
    shortLabel: 'Shawnee NF',
    latitude: 37.511,
    longitude: -88.876,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'cleveland_nf',
    label: 'Cleveland National Forest',
    shortLabel: 'Cleveland NF',
    latitude: 33.271,
    longitude: -117.022,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'green_mountain_finger_lakes_nf',
    label: 'Green Mountain and Finger Lakes National Forests',
    shortLabel: 'Green Mountain/Finger Lakes NF',
    latitude: 43.441,
    longitude: -72.974,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'lake_tahoe_basin_mgmt_unit',
    label: 'Lake Tahoe Basin Management Unit',
    shortLabel: 'Lake Tahoe Basin',
    latitude: 39.041,
    longitude: -120.057,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'wayne_nf',
    label: 'Wayne National Forest',
    shortLabel: 'Wayne NF',
    latitude: 39.1,
    longitude: -82.458,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'white_mountain_nf',
    label: 'White Mountain National Forest',
    shortLabel: 'White Mountain NF',
    latitude: 44.289,
    longitude: -71.345,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'wallowa_whitman_nf',
    label: 'Wallowa-Whitman National Forest',
    shortLabel: 'Wallowa-Whitman NF',
    latitude: 45.204,
    longitude: -116.529,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'hoosier_nf',
    label: 'Hoosier National Forest',
    shortLabel: 'Hoosier NF',
    latitude: 38.537,
    longitude: -86.543,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'columbia_river_gorge_nsa',
    label: 'Columbia River Gorge National Scenic Area',
    shortLabel: 'Columbia River Gorge',
    latitude: 45.712,
    longitude: -121.692,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'okanogan_wenatchee_nf',
    label: 'Okanogan-Wenatchee National Forest',
    shortLabel: 'Okanogan-Wenatchee NF',
    latitude: 47.376,
    longitude: -121.416,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'six_rivers_nf',
    label: 'Six Rivers National Forest',
    shortLabel: 'Six Rivers NF',
    latitude: 40.947,
    longitude: -123.459,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'tonto_nf',
    label: 'Tonto National Forest',
    shortLabel: 'Tonto NF',
    latitude: 34.4,
    longitude: -111.622,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['usfs_mvum'],
  },
  {
    key: 'michigan_orv',
    label: 'Michigan DNR ORV',
    shortLabel: 'Michigan ORV',
    latitude: 44.98,
    longitude: -84.13,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['michigan_dnr_orv_gpx'],
  },
  {
    key: 'minnesota_ohv',
    label: 'Minnesota DNR OHV',
    shortLabel: 'Minnesota OHV',
    latitude: 47.49,
    longitude: -92.46,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['minnesota_dnr_ohv_trails'],
  },
  {
    key: 'oregon_odf_ohv',
    label: 'Oregon ODF OHV',
    shortLabel: 'Oregon ODF',
    latitude: 45.55,
    longitude: -123.55,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['oregon_odf_ohv_gpx'],
  },
  {
    key: 'blm_az_gtlf',
    label: 'BLM GTLF Arizona',
    shortLabel: 'BLM AZ',
    latitude: 33.31,
    longitude: -111.73,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_ca_nv_gtlf',
    label: 'BLM GTLF CA/NV',
    shortLabel: 'BLM CA/NV',
    latitude: 36.45,
    longitude: -116.85,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_co_gtlf',
    label: 'BLM GTLF Colorado',
    shortLabel: 'BLM CO',
    latitude: 38.58,
    longitude: -105.89,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_id_gtlf',
    label: 'BLM GTLF Idaho',
    shortLabel: 'BLM ID',
    latitude: 43.11,
    longitude: -116.3,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_mt_gtlf',
    label: 'BLM GTLF Montana',
    shortLabel: 'BLM MT',
    latitude: 47.01,
    longitude: -109.82,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_nm_gtlf',
    label: 'BLM GTLF New Mexico',
    shortLabel: 'BLM NM',
    latitude: 33.65,
    longitude: -107.37,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_ut_gtlf',
    label: 'BLM GTLF Utah',
    shortLabel: 'BLM UT',
    latitude: 37.37,
    longitude: -111.78,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'blm_wy_gtlf',
    label: 'BLM GTLF Wyoming',
    shortLabel: 'BLM WY',
    latitude: 44.51,
    longitude: -107.94,
    coveragePosture: 'official_curation',
    publicRecommendation: false,
    sourceAdapters: ['blm_gtlf'],
  },
  {
    key: 'nps_public_trails_joshua_tree',
    label: 'NPS Public Trails Joshua Tree',
    shortLabel: 'NPS Joshua Tree',
    latitude: 34,
    longitude: -116.03,
    coveragePosture: 'verified_recommendation',
    publicRecommendation: true,
    sourceAdapters: ['nps_public_trails'],
  },
  {
    key: 'usgs_trails_context',
    label: 'USGS Digital Trails context',
    shortLabel: 'USGS Trails',
    latitude: null,
    longitude: null,
    coveragePosture: 'supplemental_context',
    publicRecommendation: false,
    sourceAdapters: ['usgs_trails'],
  },
];

export const ROUTE_CATALOG_PRESET_SEARCH_AREAS: RouteCatalogPresetSearchArea[] = ROUTE_CATALOG_COVERAGE_AREAS
  .filter((area): area is RouteCatalogCoverageArea & {
    key: RouteCatalogPresetSearchAreaKey;
    latitude: number;
    longitude: number;
    coveragePosture: 'verified_recommendation';
    publicRecommendation: true;
  } =>
    area.publicRecommendation === true &&
    area.coveragePosture === 'verified_recommendation' &&
    typeof area.latitude === 'number' &&
    typeof area.longitude === 'number',
  )
  .map((area) => ({
    key: area.key,
    label: area.label,
    shortLabel: area.shortLabel,
    latitude: area.latitude,
    longitude: area.longitude,
    source: 'selected_search_area',
    coveragePosture: area.coveragePosture,
    publicRecommendation: true,
    sourceAdapters: area.sourceAdapters,
  }));

export const ROUTE_CATALOG_VERIFIED_COVERAGE_LABELS = ROUTE_CATALOG_PRESET_SEARCH_AREAS
  .filter((area) => area.coveragePosture === 'verified_recommendation')
  .map((area) => area.label);

export const ROUTE_CATALOG_CURATION_COVERAGE_LABELS = ROUTE_CATALOG_COVERAGE_AREAS
  .filter((area) => area.coveragePosture === 'official_curation')
  .map((area) => area.label);

function joinCoverageLabels(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none yet';
}

export function getRouteCatalogCoverageSummary(): string {
  return `Verified recommendation coverage: ${joinCoverageLabels(ROUTE_CATALOG_VERIFIED_COVERAGE_LABELS)}. In curation: ${joinCoverageLabels(ROUTE_CATALOG_CURATION_COVERAGE_LABELS)}. No demo routes are used.`;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

function cleanLabel(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function shortLabelForManualCenter(label: string, latitude: number, longitude: number): string {
  if (label) return label.slice(0, 24);
  return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
}

export function isRouteCatalogCoordinateInConus(coordinate: {
  latitude: number;
  longitude: number;
}): boolean {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= CONUS_BOUNDS.minLatitude &&
    coordinate.latitude <= CONUS_BOUNDS.maxLatitude &&
    coordinate.longitude >= CONUS_BOUNDS.minLongitude &&
    coordinate.longitude <= CONUS_BOUNDS.maxLongitude
  );
}

export function parseRouteCatalogCoordinateText(value: string): { latitude: number; longitude: number } | null {
  const matches = String(value ?? '').match(/[-+]?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 2) return null;

  const latitude = Number(matches[0]);
  const longitude = Number(matches[1]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

export function buildManualRouteCatalogSearchArea(
  input: ManualRouteCatalogSearchAreaInput,
): ManualRouteCatalogSearchAreaResult {
  const coordinate = parseRouteCatalogCoordinateText(input.coordinateText);
  if (!coordinate) {
    return {
      ok: false,
      error: 'Enter coordinates as latitude, longitude.',
    };
  }

  if (!isRouteCatalogCoordinateInConus(coordinate)) {
    return {
      ok: false,
      error: 'Search center must be in the contiguous United States.',
    };
  }

  const label = cleanLabel(input.label) || 'Manual Search Center';
  return {
    ok: true,
    area: {
      key: 'manual_search_center',
      label,
      shortLabel: shortLabelForManualCenter(label, coordinate.latitude, coordinate.longitude),
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      source: 'manual_search_center',
    },
  };
}

export function getRouteCatalogCoverageNotice(area: RouteCatalogSearchArea | null | undefined): string {
  if (!area) {
    return `${getRouteCatalogCoverageSummary()} Select GPS or a CONUS search center to search within radius.`;
  }

  if (area.source === 'selected_search_area') {
    return `Verified recommendation coverage is active for ${area.label}.`;
  }

  if (area.source === 'manual_search_center') {
    return 'Manual CONUS center searches the live catalog within radius. Verified routes only appear where ECS has synced and reviewed source-backed coverage. No demo routes are used.';
  }

  return 'GPS searches the live catalog within radius. Verified routes only appear where ECS has synced and reviewed source-backed coverage. No demo routes are used.';
}

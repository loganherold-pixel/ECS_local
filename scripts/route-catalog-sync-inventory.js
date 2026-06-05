const fs = require('fs');
const path = require('path');

const ROUTE_CATALOG_PUBLIC_FUNCTIONS = [
  'route-catalog-search',
  'route-catalog-detail',
  'route-submission-intake',
  'route-catalog-summary',
];

const ROUTE_CATALOG_SYNC_INVENTORY = [
  {
    key: 'usfs_mvum',
    providerId: 'usfs_mvum',
    functionName: 'route-catalog-sync-usfs-mvum',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-usfs-mvum', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-usfs-mvum-sync.yml'),
    adapterTestScript: 'test:usfs-mvum-pilot-ingest',
    sourceAuthority: 'official_access',
    publicRecommendationPolicy: 'aggregate_recommendable_with_closure_gate',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      forests: [
        'tahoe-national-forest',
        'mendocino-national-forest',
        'san-juan-national-forest',
        'coconino-national-forest',
        'apache-sitgreaves-national-forests',
        'manti-la-sal-national-forest',
        'sawtooth-national-forest',
        'deschutes-national-forest',
        'kaibab-national-forest',
        'prescott-national-forest',
        'gila-national-forest',
        'santa-fe-national-forest',
        'carson-national-forest',
        'rio-grande-national-forest',
        'grand-mesa-uncompahgre-gunnison-national-forests',
        'humboldt-toiyabe-national-forest',
        'pike-san-isabel-national-forests',
        'pawnee-national-grassland',
        'cimarron-national-grassland',
        'comanche-national-grassland',
        'thunder-basin-national-grassland',
        'inyo-national-forest',
        'plumas-national-forest',
        'lassen-national-forest',
        'shasta-trinity-national-forest',
        'umpqua-national-forest',
        'fremont-winema-national-forest',
        'idaho-panhandle-national-forests',
        'helena-lewis-and-clark-national-forest',
        'fishlake-national-forest',
        'black-hills-national-forest',
        'uinta-wasatch-cache-national-forest',
        'caribou-targhee-national-forest',
        'klamath-national-forest',
        'willamette-national-forest',
        'boise-national-forest',
        'lolo-national-forest',
        'salmon-challis-national-forest',
        'stanislaus-national-forest',
        'dixie-national-forest',
        'bitterroot-national-forest',
        'mt-hood-national-forest',
        'coronado-national-forest',
        'angeles-national-forest',
        'sierra-national-forest',
        'huron-manistee-national-forest',
        'ozark-st-francis-national-forest',
        'ottawa-national-forest',
        'hiawatha-national-forest',
        'chequamegon-nicolet-national-forest',
        'national-forests-in-florida',
        'national-forests-in-alabama',
        'ouachita-national-forest',
        'mark-twain-national-forest',
        'national-forests-in-mississippi',
        'kisatchie-national-forest',
        'george-washington-jefferson-national-forest',
        'francis-marion-sumter-national-forests',
        'national-forests-in-texas',
        'national-forests-in-north-carolina',
        'allegheny-national-forest',
        'cherokee-national-forest',
        'daniel-boone-national-forest',
        'rogue-river-siskiyou-national-forests',
        'medicine-bow-routt-national-forest',
        'kootenai-national-forest',
        'gifford-pinchot-national-forest',
        'arapaho-roosevelt-national-forests',
        'umatilla-national-forest',
        'ochoco-national-forest',
        'malheur-national-forest',
        'crooked-river-national-grassland',
        'cibola-national-forest',
        'eldorado-national-forest',
        'nez-perce-clearwater-national-forest',
        'payette-national-forest',
        'superior-national-forest',
        'chippewa-national-forest',
        'sequoia-national-forest',
        'ashley-national-forest',
        'bridger-teton-national-forest',
        'siuslaw-national-forest',
        'lincoln-national-forest',
        'white-river-national-forest',
        'mt-baker-snoqualmie-national-forest',
        'flathead-national-forest',
        'olympic-national-forest',
        'custer-national-forest',
        'bighorn-national-forest',
        'colville-national-forest',
        'chattahoochee-oconee-national-forests',
        'nebraska-national-forest',
        'shoshone-national-forest',
        'san-bernardino-national-forest',
        'los-padres-national-forest',
        'dakota-prairie-grasslands',
        'monongahela-national-forest',
        'land-between-the-lakes-national-recreation-area',
        'shawnee-national-forest',
          'cleveland-national-forest',
          'green-mountain-finger-lakes-national-forests',
          'lake-tahoe-basin-management-unit',
          'kiowa-rita-blanca-national-grasslands',
          'wayne-national-forest',
        'white-mountain-national-forest',
        'wallowa-whitman-national-forest',
        'hoosier-national-forest',
        'columbia-river-gorge-national-scenic-area',
        'okanogan-wenatchee-national-forest',
        'six-rivers-national-forest',
        'tonto-national-forest',
        'beaverhead-deerlodge-national-forest',
        'chugach-national-forest',
        'custer-gallatin-national-forest',
        'gallatin-national-forest',
        'modoc-national-forest',
        'tongass-national-forest',
      ],
      minMiles: 1,
      limitPerForestLayer: 150,
      deepPagination: false,
      maxAllowableOffset: 0.000025,
    },
    expectedMaxPublicRecommendationCount: 10000,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'blm_gtlf',
    providerId: 'blm_gtlf',
    functionName: 'route-catalog-sync-blm-gtlf',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-blm-gtlf', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-blm-gtlf-sync.yml'),
    adapterTestScript: 'test:blm-gtlf-route-catalog-adapter',
    sourceAuthority: 'official_access',
    publicRecommendationPolicy: 'aggregate_recommendable_with_closure_gate',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      states: ['AK', 'AZ', 'CA', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY'],
      layers: [0, 1, 2, 3],
      minMiles: 1,
      limitPerStateLayer: 100,
    },
    deepBackfillPayload: {
      states: ['UT'],
      layers: [0],
      minMiles: 1,
      limitPerStateLayer: 250,
    },
    expectedMaxPublicRecommendationCount: 1000,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'usgs_digital_trails',
    providerId: 'usgs_digital_trails',
    functionName: 'route-catalog-sync-usgs-trails',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-usgs-trails', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-usgs-trails-sync.yml'),
    adapterTestScript: 'test:usgs-trails-route-catalog-adapter',
    sourceAuthority: 'supplemental_geometry',
    publicRecommendationPolicy: 'curation_only_zero_public_recommendations',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      bboxes: [
        {
          key: 'sierra_nevada',
          label: 'Sierra Nevada mountain context',
          bbox: { xmin: -123.2, ymin: 38.2, xmax: -118.6, ymax: 41.8 },
        },
        {
          key: 'mojave_death_valley_desert',
          label: 'Mojave and Death Valley desert context',
          bbox: { xmin: -118.4, ymin: 34.5, xmax: -114.6, ymax: 37.6 },
        },
        {
          key: 'moab_canyonlands_desert',
          label: 'Moab and Canyonlands desert context',
          bbox: { xmin: -110.7, ymin: 37.6, xmax: -108.9, ymax: 39.3 },
        },
        {
          key: 'grand_canyon_arizona_strip',
          label: 'Grand Canyon and Arizona Strip context',
          bbox: { xmin: -114.7, ymin: 35.7, xmax: -111.7, ymax: 37.3 },
        },
        {
          key: 'great_basin_mountains',
          label: 'Great Basin mountain context',
          bbox: { xmin: -115.4, ymin: 38.4, xmax: -113.6, ymax: 39.8 },
        },
        {
          key: 'san_juan_mountains',
          label: 'San Juan Mountains context',
          bbox: { xmin: -108.5, ymin: 37.0, xmax: -106.4, ymax: 38.4 },
        },
        {
          key: 'black_rock_high_rock_desert',
          label: 'Black Rock and High Rock desert context',
          bbox: { xmin: -120.4, ymin: 40.3, xmax: -118.0, ymax: 42.2 },
        },
        {
          key: 'pacific_northwest_cascades',
          label: 'Pacific Northwest Cascades context',
          bbox: { xmin: -122.8, ymin: 44.0, xmax: -121.0, ymax: 48.9 },
        },
        {
          key: 'oregon_high_desert',
          label: 'Oregon high desert context',
          bbox: { xmin: -121.7, ymin: 42.0, xmax: -117.0, ymax: 44.9 },
        },
        {
          key: 'idaho_sawtooth_boise',
          label: 'Idaho Sawtooth and Boise Mountains context',
          bbox: { xmin: -116.8, ymin: 43.3, xmax: -113.4, ymax: 45.7 },
        },
        {
          key: 'montana_northern_rockies',
          label: 'Montana northern Rockies context',
          bbox: { xmin: -115.8, ymin: 45.3, xmax: -111.0, ymax: 49.0 },
        },
        {
          key: 'wyoming_wind_river_absaroka',
          label: 'Wyoming Wind River and Absaroka context',
          bbox: { xmin: -111.3, ymin: 42.5, xmax: -107.9, ymax: 44.9 },
        },
        {
          key: 'colorado_front_range_high_country',
          label: 'Colorado Front Range high country context',
          bbox: { xmin: -106.7, ymin: 38.4, xmax: -104.5, ymax: 40.9 },
        },
        {
          key: 'arizona_sky_islands_sonoran',
          label: 'Arizona Sky Islands and Sonoran desert context',
          bbox: { xmin: -112.5, ymin: 31.3, xmax: -109.0, ymax: 34.2 },
        },
        {
          key: 'new_mexico_gila_sacramento',
          label: 'New Mexico Gila and Sacramento Mountains context',
          bbox: { xmin: -109.2, ymin: 32.0, xmax: -105.0, ymax: 34.8 },
        },
        {
          key: 'ozark_ouachita_highlands',
          label: 'Ozark and Ouachita Highlands context',
          bbox: { xmin: -95.0, ymin: 34.0, xmax: -91.0, ymax: 37.5 },
        },
        {
          key: 'southern_appalachians',
          label: 'Southern Appalachians context',
          bbox: { xmin: -84.9, ymin: 34.2, xmax: -80.7, ymax: 37.0 },
        },
        {
          key: 'upper_great_lakes_northwoods',
          label: 'Upper Great Lakes northwoods context',
          bbox: { xmin: -92.8, ymin: 44.7, xmax: -84.0, ymax: 47.8 },
        },
        {
          key: 'northern_new_england_appalachians',
          label: 'Northern New England Appalachians context',
          bbox: { xmin: -72.2, ymin: 43.8, xmax: -68.0, ymax: 46.8 },
        },
        {
          key: 'california_north_coast_klamath',
          label: 'California North Coast and Klamath context',
          bbox: { xmin: -124.5, ymin: 39.0, xmax: -121.5, ymax: 42.0 },
        },
        {
          key: 'southern_california_mountains_desert',
          label: 'Southern California mountains and desert context',
          bbox: { xmin: -117.8, ymin: 32.5, xmax: -114.0, ymax: 35.5 },
        },
        {
          key: 'nevada_central_basin_ranges',
          label: 'Nevada central basin and range context',
          bbox: { xmin: -117.5, ymin: 37.5, xmax: -114.5, ymax: 40.0 },
        },
        {
          key: 'uinta_wasatch_mountains',
          label: 'Uinta and Wasatch Mountains context',
          bbox: { xmin: -112.4, ymin: 39.4, xmax: -109.0, ymax: 41.8 },
        },
        {
          key: 'yellowstone_teton_absaroka',
          label: 'Yellowstone, Teton, and Absaroka context',
          bbox: { xmin: -111.0, ymin: 43.2, xmax: -108.8, ymax: 45.6 },
        },
        {
          key: 'dakota_badlands_missouri_breaks',
          label: 'Dakota badlands and Missouri breaks context',
          bbox: { xmin: -104.5, ymin: 44.0, xmax: -101.0, ymax: 48.5 },
        },
        {
          key: 'southeast_piney_woods',
          label: 'Southeast piney woods context',
          bbox: { xmin: -91.5, ymin: 30.0, xmax: -84.0, ymax: 33.8 },
        },
        {
          key: 'florida_sandhills_swamps',
          label: 'Florida sandhills and swamps context',
          bbox: { xmin: -87.8, ymin: 24.5, xmax: -80.0, ymax: 31.2 },
        },
        {
          key: 'adirondack_northern_new_york',
          label: 'Adirondack and northern New York context',
          bbox: { xmin: -75.8, ymin: 43.0, xmax: -73.0, ymax: 45.3 },
        },
        {
          key: 'pennsylvania_alleghenies',
          label: 'Pennsylvania Alleghenies context',
          bbox: { xmin: -80.8, ymin: 40.0, xmax: -77.0, ymax: 42.5 },
        },
        {
          key: 'alaska_southcentral_mountains',
          label: 'Alaska southcentral mountains context',
          bbox: { xmin: -152.5, ymin: 60.0, xmax: -145.0, ymax: 63.0 },
        },
        {
          key: 'hawaii_volcanic_highlands',
          label: 'Hawaii volcanic highlands context',
          bbox: { xmin: -156.5, ymin: 18.8, xmax: -154.6, ymax: 20.3 },
        },
        {
          key: 'appalachian_plateau_coalfields',
          label: 'Appalachian Plateau and coalfields context',
          bbox: { xmin: -83.5, ymin: 37.2, xmax: -80.0, ymax: 39.5 },
        },
        {
          key: 'olympic_peninsula_coast_ranges',
          label: 'Olympic Peninsula and coast ranges context',
          bbox: { xmin: -124.9, ymin: 46.8, xmax: -122.0, ymax: 48.6 },
        },
        {
          key: 'washington_columbia_plateau',
          label: 'Washington Columbia Plateau context',
          bbox: { xmin: -121.0, ymin: 45.5, xmax: -117.0, ymax: 48.8 },
        },
        {
          key: 'oregon_coast_range',
          label: 'Oregon Coast Range context',
          bbox: { xmin: -124.6, ymin: 42.0, xmax: -122.0, ymax: 46.3 },
        },
        {
          key: 'arizona_mogollon_rim',
          label: 'Arizona Mogollon Rim context',
          bbox: { xmin: -112.8, ymin: 33.7, xmax: -109.0, ymax: 35.5 },
        },
        {
          key: 'wyoming_bighorn_powder',
          label: 'Wyoming Bighorn and Powder River context',
          bbox: { xmin: -108.5, ymin: 43.0, xmax: -104.0, ymax: 45.5 },
        },
        {
          key: 'nebraska_sandhills_pine_ridge',
          label: 'Nebraska Sandhills and Pine Ridge context',
          bbox: { xmin: -104.2, ymin: 41.0, xmax: -99.0, ymax: 43.5 },
        },
        {
          key: 'missouri_ozark_highlands',
          label: 'Missouri Ozark Highlands context',
          bbox: { xmin: -93.8, ymin: 36.0, xmax: -90.2, ymax: 38.5 },
        },
        {
          key: 'central_appalachians_monongahela',
          label: 'Central Appalachians and Monongahela context',
          bbox: { xmin: -81.5, ymin: 37.5, xmax: -78.0, ymax: 40.0 },
        },
        {
          key: 'new_jersey_pine_barrens',
          label: 'New Jersey Pine Barrens context',
          bbox: { xmin: -75.5, ymin: 39.0, xmax: -73.8, ymax: 40.3 },
        },
        {
          key: 'lower_michigan_state_forests',
          label: 'Lower Michigan state forests context',
          bbox: { xmin: -86.5, ymin: 43.0, xmax: -82.5, ymax: 45.5 },
        },
        {
          key: 'utah_dixie_bryce_plateaus',
          label: 'Utah Dixie and Bryce plateaus context',
          bbox: { xmin: -113.6, ymin: 36.8, xmax: -111.0, ymax: 38.6 },
        },
        {
          key: 'alaska_southeast_tongass',
          label: 'Alaska Southeast and Tongass context',
          bbox: { xmin: -136.8, ymin: 55.0, xmax: -130.0, ymax: 59.8 },
        },
        {
          key: 'idaho_panhandle_selkirks',
          label: 'Idaho Panhandle and Selkirk Mountains context',
          bbox: { xmin: -117.3, ymin: 46.8, xmax: -114.5, ymax: 49.0 },
        },
        {
          key: 'south_dakota_black_hills',
          label: 'South Dakota Black Hills context',
          bbox: { xmin: -104.2, ymin: 43.5, xmax: -102.8, ymax: 44.8 },
        },
        {
          key: 'georgia_alabama_piedmont',
          label: 'Georgia and Alabama Piedmont context',
          bbox: { xmin: -86.0, ymin: 32.0, xmax: -82.0, ymax: 34.7 },
        },
        {
          key: 'alabama_talladega_bankhead',
          label: 'Alabama Talladega and Bankhead context',
          bbox: { xmin: -88.0, ymin: 32.5, xmax: -85.0, ymax: 35.0 },
        },
        {
          key: 'mississippi_delta_hills',
          label: 'Mississippi Delta and hill country context',
          bbox: { xmin: -91.5, ymin: 31.0, xmax: -88.0, ymax: 34.8 },
        },
        {
          key: 'kentucky_cumberland_plateau',
          label: 'Kentucky Cumberland Plateau context',
          bbox: { xmin: -86.0, ymin: 36.3, xmax: -82.5, ymax: 38.6 },
        },
        {
          key: 'ohio_wayne_appalachian_foothills',
          label: 'Ohio Wayne and Appalachian foothills context',
          bbox: { xmin: -83.5, ymin: 38.8, xmax: -80.5, ymax: 40.7 },
        },
        {
          key: 'alaska_kenai_chugach',
          label: 'Alaska Kenai and Chugach context',
          bbox: { xmin: -152.0, ymin: 58.8, xmax: -147.0, ymax: 61.5 },
        },
        {
          key: 'arkansas_boston_ouachita',
          label: 'Arkansas Boston and Ouachita Mountains context',
          bbox: { xmin: -94.8, ymin: 34.0, xmax: -91.5, ymax: 36.5 },
        },
        {
          key: 'wisconsin_northwoods',
          label: 'Wisconsin northwoods context',
          bbox: { xmin: -91.0, ymin: 44.5, xmax: -87.0, ymax: 46.8 },
        },
        {
          key: 'minnesota_iron_range_arrowhead',
          label: 'Minnesota Iron Range and Arrowhead context',
          bbox: { xmin: -94.5, ymin: 46.0, xmax: -90.0, ymax: 48.5 },
        },
        {
          key: 'north_carolina_pisgah_nantahala',
          label: 'North Carolina Pisgah and Nantahala context',
          bbox: { xmin: -84.5, ymin: 34.7, xmax: -81.0, ymax: 36.5 },
        },
        {
          key: 'oregon_blue_mountains',
          label: 'Oregon Blue Mountains context',
          bbox: { xmin: -120.0, ymin: 43.5, xmax: -116.5, ymax: 46.3 },
        },
        {
          key: 'washington_okanogan_highlands',
          label: 'Washington Okanogan Highlands context',
          bbox: { xmin: -120.8, ymin: 47.3, xmax: -117.0, ymax: 49.0 },
        },
        {
          key: 'montana_prairie_breaks',
          label: 'Montana prairie breaks context',
          bbox: { xmin: -111.5, ymin: 46.0, xmax: -106.0, ymax: 48.8 },
        },
        {
          key: 'wyoming_red_desert_south_pass',
          label: 'Wyoming Red Desert and South Pass context',
          bbox: { xmin: -110.5, ymin: 41.0, xmax: -107.0, ymax: 42.9 },
        },
        {
          key: 'utah_west_desert_san_rafael',
          label: 'Utah West Desert and San Rafael context',
          bbox: { xmin: -113.8, ymin: 38.0, xmax: -110.5, ymax: 40.2 },
        },
        {
          key: 'colorado_san_luis_sangre_de_cristo',
          label: 'Colorado San Luis Valley and Sangre de Cristo context',
          bbox: { xmin: -106.3, ymin: 36.9, xmax: -104.8, ymax: 38.5 },
        },
        {
          key: 'tennessee_cumberland_highlands',
          label: 'Tennessee Cumberland Highlands context',
          bbox: { xmin: -86.5, ymin: 35.0, xmax: -83.5, ymax: 36.8 },
        },
        {
          key: 'virginia_blue_ridge',
          label: 'Virginia Blue Ridge context',
          bbox: { xmin: -80.5, ymin: 36.5, xmax: -77.5, ymax: 39.0 },
        },
        {
          key: 'west_virginia_allegheny_plateau',
          label: 'West Virginia Allegheny Plateau context',
          bbox: { xmin: -82.5, ymin: 37.5, xmax: -79.0, ymax: 40.5 },
        },
        {
          key: 'new_hampshire_white_mountains',
          label: 'New Hampshire White Mountains context',
          bbox: { xmin: -72.5, ymin: 43.5, xmax: -70.5, ymax: 45.3 },
        },
        {
          key: 'louisiana_kisatchie_piney_woods',
          label: 'Louisiana Kisatchie piney woods context',
          bbox: { xmin: -94.0, ymin: 30.0, xmax: -91.0, ymax: 32.5 },
        },
        {
          key: 'north_dakota_badlands',
          label: 'North Dakota badlands context',
          bbox: { xmin: -104.2, ymin: 46.0, xmax: -102.0, ymax: 48.5 },
        },
        {
          key: 'oregon_klamath_siskiyou',
          label: 'Oregon Klamath and Siskiyou context',
          bbox: { xmin: -124.0, ymin: 41.8, xmax: -121.0, ymax: 43.8 },
        },
        {
          key: 'california_central_sierra_inyo',
          label: 'California Central Sierra and Inyo context',
          bbox: { xmin: -120.5, ymin: 35.5, xmax: -117.5, ymax: 38.8 },
        },
        {
          key: 'idaho_eastern_targhee',
          label: 'Idaho Eastern Targhee context',
          bbox: { xmin: -113.5, ymin: 42.0, xmax: -110.8, ymax: 44.8 },
        },
        {
          key: 'wyoming_snowy_range_laramie',
          label: 'Wyoming Snowy Range and Laramie context',
          bbox: { xmin: -107.5, ymin: 40.8, xmax: -104.8, ymax: 42.8 },
        },
        {
          key: 'colorado_yampa_white_river',
          label: 'Colorado Yampa and White River context',
          bbox: { xmin: -108.8, ymin: 39.6, xmax: -106.0, ymax: 41.1 },
        },
        {
          key: 'utah_la_sal_abajo_mountains',
          label: 'Utah La Sal and Abajo Mountains context',
          bbox: { xmin: -110.5, ymin: 37.5, xmax: -108.8, ymax: 39.0 },
        },
        {
          key: 'new_mexico_zuni_cibola',
          label: 'New Mexico Zuni and Cibola context',
          bbox: { xmin: -109.2, ymin: 34.5, xmax: -106.5, ymax: 36.0 },
        },
        {
          key: 'pennsylvania_poconos_endless_mountains',
          label: 'Pennsylvania Poconos and Endless Mountains context',
          bbox: { xmin: -77.5, ymin: 40.5, xmax: -74.2, ymax: 42.5 },
        },
        {
          key: 'new_york_tug_hill_adirondack_west',
          label: 'New York Tug Hill and western Adirondacks context',
          bbox: { xmin: -76.5, ymin: 43.0, xmax: -74.0, ymax: 44.8 },
        },
        {
          key: 'new_mexico_sacramento_capitan',
          label: 'New Mexico Sacramento and Capitan context',
          bbox: { xmin: -106.5, ymin: 32.2, xmax: -104.5, ymax: 34.0 },
        },
        {
          key: 'colorado_grand_mesa_uncompahgre',
          label: 'Colorado Grand Mesa and Uncompahgre context',
          bbox: { xmin: -108.8, ymin: 37.8, xmax: -107.0, ymax: 39.3 },
        },
        {
          key: 'massachusetts_berkshires',
          label: 'Massachusetts Berkshires context',
          bbox: { xmin: -73.5, ymin: 42.0, xmax: -72.0, ymax: 43.0 },
        },
        {
          key: 'california_mendocino_trinity',
          label: 'California Mendocino and Trinity context',
          bbox: { xmin: -123.8, ymin: 39.7, xmax: -121.8, ymax: 41.4 },
        },
        {
          key: 'nevada_spring_sheep_ranges',
          label: 'Nevada Spring and Sheep Ranges context',
          bbox: { xmin: -116.2, ymin: 35.5, xmax: -114.5, ymax: 37.0 },
        },
        {
          key: 'arizona_prescott_bradshaw',
          label: 'Arizona Prescott and Bradshaw context',
          bbox: { xmin: -113.2, ymin: 34.0, xmax: -111.6, ymax: 35.3 },
        },
        {
          key: 'montana_beartooth_crazies',
          label: 'Montana Beartooth and Crazies context',
          bbox: { xmin: -111.5, ymin: 45.0, xmax: -109.0, ymax: 47.0 },
        },
        {
          key: 'montana_bitterroot_sapphire',
          label: 'Montana Bitterroot and Sapphire context',
          bbox: { xmin: -114.8, ymin: 45.0, xmax: -112.8, ymax: 47.5 },
        },
        {
          key: 'wyoming_bighorn_mountains',
          label: 'Wyoming Bighorn Mountains context',
          bbox: { xmin: -108.2, ymin: 43.3, xmax: -106.0, ymax: 45.2 },
        },
        {
          key: 'south_carolina_upstate_blue_ridge',
          label: 'South Carolina Upstate Blue Ridge context',
          bbox: { xmin: -83.4, ymin: 34.0, xmax: -81.0, ymax: 35.4 },
        },
        {
          key: 'new_york_finger_lakes_southern_tier',
          label: 'New York Finger Lakes and Southern Tier context',
          bbox: { xmin: -78.6, ymin: 41.5, xmax: -75.0, ymax: 43.2 },
        },
        {
          key: 'delaware_maryland_coastal_plain',
          label: 'Delaware and Maryland Coastal Plain context',
          bbox: { xmin: -76.5, ymin: 38.0, xmax: -74.8, ymax: 39.8 },
        },
        {
          key: 'michigan_upper_peninsula_keweenaw',
          label: 'Michigan Upper Peninsula and Keweenaw context',
          bbox: { xmin: -90.8, ymin: 45.6, xmax: -84.8, ymax: 47.8 },
        },
        {
          key: 'vermont_green_mountains',
          label: 'Vermont Green Mountains context',
          bbox: { xmin: -73.5, ymin: 42.5, xmax: -71.5, ymax: 45.1 },
        },
        {
          key: 'maine_northern_woods',
          label: 'Maine Northern Woods context',
          bbox: { xmin: -71.5, ymin: 44.0, xmax: -67.0, ymax: 47.5 },
        },
        {
          key: 'oregon_umpqua_rogue_cascades',
          label: 'Oregon Umpqua and Rogue Cascades context',
          bbox: { xmin: -123.5, ymin: 42.0, xmax: -121.0, ymax: 44.0 },
        },
        {
          key: 'california_modoc_lassen_plateau',
          label: 'California Modoc and Lassen Plateau context',
          bbox: { xmin: -122.5, ymin: 40.5, xmax: -120.0, ymax: 42.5 },
        },
        {
          key: 'nevada_humboldt_ruby_ranges',
          label: 'Nevada Humboldt and Ruby ranges context',
          bbox: { xmin: -117.5, ymin: 39.5, xmax: -114.5, ymax: 41.8 },
        },
        {
          key: 'arizona_kaibab_coconino_plateaus',
          label: 'Arizona Kaibab and Coconino plateaus context',
          bbox: { xmin: -113.5, ymin: 34.5, xmax: -111.0, ymax: 36.7 },
        },
        {
          key: 'new_mexico_jemez_chama',
          label: 'New Mexico Jemez and Chama context',
          bbox: { xmin: -107.5, ymin: 35.4, xmax: -105.5, ymax: 37.2 },
        },
        {
          key: 'colorado_sawatch_gunnison',
          label: 'Colorado Sawatch and Gunnison context',
          bbox: { xmin: -107.5, ymin: 38.0, xmax: -105.5, ymax: 39.5 },
        },
        {
          key: 'colorado_pikes_peak_south_park',
          label: 'Colorado Pikes Peak and South Park context',
          bbox: { xmin: -106.0, ymin: 38.4, xmax: -104.5, ymax: 39.5 },
        },
        {
          key: 'utah_book_cliffs_bears_ears',
          label: 'Utah Book Cliffs and Bears Ears context',
          bbox: { xmin: -111.0, ymin: 37.0, xmax: -108.5, ymax: 40.0 },
        },
        {
          key: 'idaho_clearwater_bitterroot',
          label: 'Idaho Clearwater and Bitterroot context',
          bbox: { xmin: -116.5, ymin: 45.5, xmax: -114.0, ymax: 47.5 },
        },
        {
          key: 'idaho_magic_valley_south_hills',
          label: 'Idaho Magic Valley and South Hills context',
          bbox: { xmin: -115.5, ymin: 41.8, xmax: -113.0, ymax: 43.5 },
        },
        {
          key: 'montana_kootenai_cabinet',
          label: 'Montana Kootenai and Cabinet context',
          bbox: { xmin: -116.0, ymin: 47.0, xmax: -114.0, ymax: 49.0 },
        },
        {
          key: 'maryland_pennsylvania_ridge_valley',
          label: 'Maryland and Pennsylvania Ridge and Valley context',
          bbox: { xmin: -79.0, ymin: 39.0, xmax: -76.0, ymax: 41.0 },
        },
      ],
      minMiles: 1,
      limitPerBbox: 150,
    },
    expectedMaxPublicRecommendationCount: 0,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'nps_public_trails',
    providerId: 'nps_public_trails',
    functionName: 'route-catalog-sync-nps-trails',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-nps-trails', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-nps-trails-sync.yml'),
    adapterTestScript: 'test:nps-trails-route-catalog-adapter',
    sourceAuthority: 'official_context',
    publicRecommendationPolicy: 'official_source_recommendable_with_condition_warnings',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      bboxes: [
        {
          key: 'joshua_tree',
          label: 'Joshua Tree National Park',
          bbox: { xmin: -116.3066, ymin: 33.7377, xmax: -115.7726, ymax: 34.2586 },
        },
        {
          key: 'big_south_fork',
          label: 'Big South Fork National River and Recreation Area',
          bbox: { xmin: -85.044, ymin: 36.2043, xmax: -84.2655, ymax: 36.9675 },
        },
        {
          key: 'shenandoah',
          label: 'Shenandoah National Park',
          bbox: { xmin: -78.5545, ymin: 38.5115, xmax: -78.0496, ymax: 39.0132 },
        },
        {
          key: 'everglades',
          label: 'Everglades National Park',
          bbox: { xmin: -81.0171, ymin: 25.4077, xmax: -80.5086, ymax: 26.007 },
        },
        {
          key: 'timucuan',
          label: 'Timucuan Ecological and Historic Preserve',
          bbox: { xmin: -81.9059, ymin: 30.2815, xmax: -81.3716, ymax: 30.8132 },
        },
        {
          key: 'channel_islands',
          label: 'Channel Islands National Park',
          bbox: { xmin: -120.6832, ymin: 33.7801, xmax: -120.1632, ymax: 34.2924 },
        },
        {
          key: 'denali',
          label: 'Denali National Park and Preserve',
          bbox: { xmin: -151.2385, ymin: 63.2606, xmax: -150.4213, ymax: 63.8374 },
        },
        {
          key: 'wrangell_st_elias',
          label: 'Wrangell-St Elias National Park and Preserve',
          bbox: { xmin: -144.5504, ymin: 61.2366, xmax: -142.5884, ymax: 62.8671 },
        },
        {
          key: 'glacier_bay',
          label: 'Glacier Bay National Park and Preserve',
          bbox: { xmin: -138.831, ymin: 58.8263, xmax: -137.9997, ymax: 59.4408 },
        },
        {
          key: 'klondike_gold_rush',
          label: 'Klondike Gold Rush National Historical Park',
          bbox: { xmin: -135.6085, ymin: 59.243, xmax: -135.0971, ymax: 59.7734 },
        },
        {
          key: 'lake_clark',
          label: 'Lake Clark National Park and Preserve',
          bbox: { xmin: -154.5629, ymin: 59.9417, xmax: -154.0563, ymax: 60.4472 },
        },
        {
          key: 'yukon_charley',
          label: 'Yukon-Charley Rivers National Preserve',
          bbox: { xmin: -143.6243, ymin: 65.0307, xmax: -142.8633, ymax: 65.6006 },
        },
        {
          key: 'kaloko_honokohau',
          label: 'Kaloko-Honokohau National Historical Park',
          bbox: { xmin: -156.0754, ymin: 19.6211, xmax: -155.9667, ymax: 19.7284 },
        },
        {
          key: 'american_samoa',
          label: 'National Park of American Samoa',
          bbox: { xmin: -170.7226, ymin: -14.2951, xmax: -170.6212, ymax: -14.1921 },
        },
        {
          key: 'war_in_the_pacific',
          label: 'War in the Pacific National Historical Park',
          bbox: { xmin: 144.6441, ymin: 13.4112, xmax: 144.7618, ymax: 13.5236 },
        },
      ],
      minMiles: 0.1,
      limitPerBbox: 150,
    },
    expectedMaxPublicRecommendationCount: 900,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'michigan_dnr_orv_gpx',
    providerId: 'michigan_dnr_orv_gpx',
    functionName: 'route-catalog-sync-michigan-orv',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-michigan-orv', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-michigan-orv-sync.yml'),
    adapterTestScript: 'test:michigan-orv-route-catalog-adapter',
    sourceAuthority: 'official_access',
    publicRecommendationPolicy: 'official_source_recommendable_with_condition_warnings',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      sourceKeys: ['alcona_orv_trail', 'atlanta_route', 'evart_motorcycle_trail', 'statewide_orv_trail_gpx'],
      syncScope: 'statewide',
      minMiles: 1,
      maxTracksPerSource: 20,
    },
    deepBackfillPayload: {
      sourceKeys: ['alcona_orv_trail', 'atlanta_route', 'evart_motorcycle_trail', 'statewide_orv_trail_gpx'],
      syncScope: 'statewide',
      minMiles: 1,
      maxTracksPerSource: 100,
    },
    expectedMaxPublicRecommendationCount: 400,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'minnesota_dnr_ohv_trails',
    providerId: 'minnesota_dnr_ohv_trails',
    functionName: 'route-catalog-sync-minnesota-ohv',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-minnesota-ohv', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-minnesota-ohv-sync.yml'),
    adapterTestScript: 'test:minnesota-ohv-route-catalog-adapter',
    sourceAuthority: 'official_access',
    publicRecommendationPolicy: 'official_source_recommendable_with_condition_warnings',
    publicRuntimeCallable: false,
    invocationMode: 'workflow_preprocess_required',
    defaultPayload: null,
    deepBackfillPayload: {
      syncScope: 'statewide',
      minMiles: 1,
      maxFeatures: 1000,
    },
    expectedMaxPublicRecommendationCount: 1000,
    preprocessReason: 'Minnesota DNR OHV sync requires the durable GitHub workflow to download and convert the official GeoPackage into bounded GeoJSON sourceFeatures before invoking the Edge Function; the workflow now defaults to the bounded statewide 1000-feature conversion while keeping a smaller pilot selectable.',
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'oregon_odf_ohv_gpx',
    providerId: 'oregon_odf_ohv_gpx',
    functionName: 'route-catalog-sync-oregon-odf-ohv',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-oregon-odf-ohv', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-oregon-odf-ohv-sync.yml'),
    adapterTestScript: 'test:oregon-odf-ohv-route-catalog-adapter',
    sourceAuthority: 'official_access',
    publicRecommendationPolicy: 'official_source_recommendable_with_condition_warnings',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      sourceKeys: ['tillamook_class_i', 'tillamook_class_ii_iv', 'tillamook_class_iii'],
      minMiles: 0.25,
      maxTracksPerSource: 200,
    },
    expectedMaxPublicRecommendationCount: 600,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'colorado_cpw_designated_trails',
    providerId: 'colorado_cpw_designated_trails',
    functionName: 'route-catalog-sync-colorado-cpw-trails',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-colorado-cpw-trails', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-colorado-cpw-trails-sync.yml'),
    adapterTestScript: 'test:colorado-cpw-route-catalog-adapter',
    sourceAuthority: 'official_access',
    publicRecommendationPolicy: 'official_source_recommendable_with_condition_warnings',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      minMiles: 0.25,
      maxFeatures: 150,
    },
    deepBackfillPayload: {
      syncScope: 'statewide',
      minMiles: 0.25,
      maxFeatures: 500,
    },
    expectedMaxPublicRecommendationCount: 500,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'utah_sgid_trails',
    providerId: 'utah_sgid_trails',
    functionName: 'route-catalog-sync-utah-trails',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-utah-trails', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-utah-trails-sync.yml'),
    adapterTestScript: 'test:utah-trails-route-catalog-adapter',
    sourceAuthority: 'official_access',
    publicRecommendationPolicy: 'official_source_recommendable_with_condition_warnings',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      minMiles: 0.25,
      maxFeatures: 250,
    },
    deepBackfillPayload: {
      syncScope: 'statewide',
      minMiles: 0.25,
      maxFeatures: 1000,
    },
    expectedMaxPublicRecommendationCount: 1000,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'arizona_state_parks_trails',
    providerId: 'arizona_state_parks_trails',
    functionName: 'route-catalog-sync-arizona-trails',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-arizona-trails', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-arizona-trails-sync.yml'),
    adapterTestScript: 'test:arizona-trails-route-catalog-adapter',
    sourceAuthority: 'official_access',
    publicRecommendationPolicy: 'official_source_recommendable_with_condition_warnings',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      minMiles: 0.25,
      maxFeatures: 250,
    },
    deepBackfillPayload: {
      syncScope: 'statewide',
      minMiles: 0.25,
      maxFeatures: 1000,
    },
    expectedMaxPublicRecommendationCount: 1000,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
  },
  {
    key: 'stitch_groups',
    providerId: 'route_catalog_stitch_groups',
    functionName: 'route-catalog-sync-stitch-groups',
    functionPath: path.join('supabase', 'functions', 'route-catalog-sync-stitch-groups', 'index.ts'),
    workflowPath: path.join('.github', 'workflows', 'route-catalog-stitch-groups-sync.yml'),
    adapterTestScript: 'test:route-catalog-stitchability-audit',
    sourceAuthority: 'internal_review',
    publicRecommendationPolicy: 'review_only_zero_public_recommendations',
    publicRuntimeCallable: false,
    invocationMode: 'workflow_preprocess_required',
    defaultPayload: null,
    expectedMaxPublicRecommendationCount: 0,
    preprocessReason: 'Stitch group sync requires the durable GitHub workflow to generate a fresh route-catalog stitchability dry-run plan, require explicit confirm_write approval, and then invoke the protected Edge Function with service-role writes.',
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count', 'no_public_route_exposure'],
  },
];

function routeCatalogSyncFunctionNames() {
  return ROUTE_CATALOG_SYNC_INVENTORY.map((entry) => entry.functionName);
}

function routeCatalogPublicFunctionNames() {
  return [...ROUTE_CATALOG_PUBLIC_FUNCTIONS];
}

function routeCatalogDeployFunctionNames() {
  return [...ROUTE_CATALOG_PUBLIC_FUNCTIONS, ...routeCatalogSyncFunctionNames()];
}

function cloneJson(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function deepBackfillPayloadForEntry(entry) {
  if (entry.key !== 'usfs_mvum') return entry.deepBackfillPayload;
  return {
    ...cloneJson(entry.defaultPayload),
    limitPerForestLayer: 2500,
    deepPagination: true,
  };
}

function buildRouteCatalogSyncInvocationPlan() {
  return ROUTE_CATALOG_SYNC_INVENTORY.map((entry) => ({
    key: entry.key,
    providerId: entry.providerId,
    functionName: entry.functionName,
    functionPath: entry.functionPath,
    workflowPath: entry.workflowPath,
    sourceAuthority: entry.sourceAuthority,
    publicRecommendationPolicy: entry.publicRecommendationPolicy,
    invocationMode: entry.invocationMode,
    defaultPayload: cloneJson(entry.defaultPayload),
    deepBackfillPayload: cloneJson(deepBackfillPayloadForEntry(entry)),
    expectedMaxPublicRecommendationCount: entry.expectedMaxPublicRecommendationCount,
    preprocessReason: entry.preprocessReason || '',
    safetyNotes: [
      'Requires ECS_ROUTE_CATALOG_SYNC_TOKEN via x-ecs-sync-token; never print or embed the sync token.',
      'Runs server-side with service-role credentials only inside the Supabase Edge Function.',
      'Uses a bounded payload so source syncs cannot accidentally ingest an unbounded national feed.',
      entry.publicRecommendationPolicy === 'curation_only_zero_public_recommendations'
        ? 'Curation-only ingestion must produce zero public recommendations until deterministic review promotes records.'
        : entry.publicRecommendationPolicy === 'review_only_zero_public_recommendations'
          ? 'Review-only stitch group sync must produce zero public recommendations and must not expose draft groups through the public catalog.'
          : entry.publicRecommendationPolicy === 'aggregate_recommendable_with_closure_gate'
            ? 'Official aggregate records may create public recommendations only behind deterministic access, limitation, and closure gates.'
            : 'Official source records may create public recommendations when the adapter applies deterministic public-use filters and keeps current-condition warnings visible.',
      entry.key === 'usfs_mvum'
        ? 'USFS MVUM deep backfill is opt-in and raises the bounded per-forest/layer cap without splitting aggregate route identity across pages.'
        : '',
    ].filter(Boolean),
  }));
}

function readIfExists(root, relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function supabaseFunctionConfigSection(config, functionName) {
  const startToken = `[functions.${functionName}]`;
  const start = config.indexOf(startToken);
  if (start < 0) return '';
  const next = config.indexOf('\n[functions.', start + startToken.length);
  return next >= 0 ? config.slice(start, next) : config.slice(start);
}

function validateRouteCatalogSyncInventory(root = path.join(__dirname, '..')) {
  const errors = [];
  const packageJson = readIfExists(root, 'package.json') ?? '';
  const supabaseConfig = readIfExists(root, path.join('supabase', 'config.toml')) ?? '';
  const seenFunctions = new Set();

  for (const entry of ROUTE_CATALOG_SYNC_INVENTORY) {
    if (seenFunctions.has(entry.functionName)) {
      errors.push(`Duplicate route catalog sync function inventory entry: ${entry.functionName}`);
    }
    seenFunctions.add(entry.functionName);

    if (!['direct_edge_function', 'workflow_preprocess_required'].includes(entry.invocationMode)) {
      errors.push(`${entry.functionName} has an invalid invocation mode`);
    }
    if (entry.invocationMode === 'direct_edge_function' && (!entry.defaultPayload || typeof entry.defaultPayload !== 'object')) {
      errors.push(`${entry.functionName} direct invocation is missing a default payload`);
    }
    if (entry.invocationMode === 'workflow_preprocess_required') {
      if (entry.defaultPayload !== null) errors.push(`${entry.functionName} workflow-preprocess invocation should not define a direct payload`);
      if (!entry.preprocessReason) errors.push(`${entry.functionName} workflow-preprocess invocation should explain its preprocessing requirement`);
    }
    if (!Number.isInteger(entry.expectedMaxPublicRecommendationCount) || entry.expectedMaxPublicRecommendationCount < 0) {
      errors.push(`${entry.functionName} missing expected public recommendation upper bound`);
    }
    if (
      (
        entry.publicRecommendationPolicy === 'curation_only_zero_public_recommendations' ||
        entry.publicRecommendationPolicy === 'review_only_zero_public_recommendations'
      ) &&
      entry.expectedMaxPublicRecommendationCount !== 0
    ) {
      errors.push(`${entry.functionName} review-only/curation-only sync should expect zero public recommendations`);
    }

    const functionSource = readIfExists(root, entry.functionPath);
    const workflowSource = readIfExists(root, entry.workflowPath);
    const configEntry = supabaseFunctionConfigSection(supabaseConfig, entry.functionName);

    if (!functionSource) errors.push(`Missing Edge Function file for ${entry.functionName}`);
    if (!workflowSource) errors.push(`Missing durable workflow for ${entry.functionName}`);
    if (!packageJson.includes(`"${entry.adapterTestScript}"`)) {
      errors.push(`Missing package.json script ${entry.adapterTestScript} for ${entry.functionName}`);
    }
    if (!configEntry) {
      errors.push(`Missing Supabase config entry for ${entry.functionName}`);
    } else {
      if (!configEntry.includes('enabled = true')) errors.push(`${entry.functionName} is not enabled in Supabase config`);
      if (!configEntry.includes('verify_jwt = false')) errors.push(`${entry.functionName} should use sync-token auth instead of JWT`);
      if (!configEntry.includes(`entrypoint = "./functions/${entry.functionName}/index.ts"`)) {
        errors.push(`${entry.functionName} Supabase config entrypoint is missing or mismatched`);
      }
    }
    if (functionSource) {
      if (!functionSource.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN')) errors.push(`${entry.functionName} does not require sync token`);
      if (!functionSource.includes('ECS_SERVICE_ROLE_KEY') && !functionSource.includes('SUPABASE_SERVICE_ROLE_KEY')) {
        errors.push(`${entry.functionName} does not use service-role credentials`);
      }
      for (const required of ['route_sources', 'route_source_ingest_runs', 'verified_routes', 'publicRecommendationCount']) {
        if (!functionSource.includes(required)) errors.push(`${entry.functionName} missing ${required}`);
      }
    }
    if (workflowSource) {
      for (const required of [
        entry.functionName,
        'ECS_SUPABASE_URL',
        'ECS_ROUTE_CATALOG_SYNC_TOKEN',
        'concurrency:',
        'publicRecommendationCount',
      ]) {
        if (!workflowSource.includes(required)) errors.push(`${entry.functionName} workflow missing ${required}`);
      }
      const preservesFailureBody = workflowSource.includes('curl --fail-with-body') ||
        (workflowSource.includes('--write-out "%{http_code}"') && workflowSource.includes('sync-response.json'));
      if (!preservesFailureBody) errors.push(`${entry.functionName} workflow missing HTTP failure body handling`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    functionNames: routeCatalogSyncFunctionNames(),
    deployFunctionNames: routeCatalogDeployFunctionNames(),
  };
}

module.exports = {
  ROUTE_CATALOG_PUBLIC_FUNCTIONS,
  ROUTE_CATALOG_SYNC_INVENTORY,
  buildRouteCatalogSyncInvocationPlan,
  routeCatalogDeployFunctionNames,
  routeCatalogPublicFunctionNames,
  routeCatalogSyncFunctionNames,
  validateRouteCatalogSyncInventory,
};

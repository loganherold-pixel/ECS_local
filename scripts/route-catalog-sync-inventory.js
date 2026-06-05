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
        'sierra-national-forest',
        'huron-manistee-national-forest',
        'ozark-st-francis-national-forest',
        'ottawa-national-forest',
        'hiawatha-national-forest',
        'chequamegon-nicolet-national-forest',
        'national-forests-in-florida',
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
      bbox: { xmin: -123.2, ymin: 38.2, xmax: -118.6, ymax: 41.8 },
      minMiles: 1,
      limit: 150,
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

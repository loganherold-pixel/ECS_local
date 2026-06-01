const fs = require('fs');
const path = require('path');

const ROUTE_CATALOG_PUBLIC_FUNCTIONS = [
  'route-catalog-search',
  'route-catalog-detail',
  'route-submission-intake',
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
      ],
      minMiles: 1,
      limitPerForestLayer: 150,
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
      states: ['AZ', 'CA', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY'],
      layers: [0, 1, 2, 3],
      minMiles: 1,
      limitPerStateLayer: 100,
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
    publicRecommendationPolicy: 'curation_only_zero_public_recommendations',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      bbox: { xmin: -124.8, ymin: 32.5, xmax: -113.8, ymax: 42.2 },
      minMiles: 0.1,
      limit: 150,
    },
    expectedMaxPublicRecommendationCount: 0,
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
    publicRecommendationPolicy: 'curation_only_zero_public_recommendations',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      sourceKeys: ['alcona_orv_trail', 'atlanta_route', 'evart_motorcycle_trail'],
      minMiles: 1,
      maxTracksPerSource: 20,
    },
    expectedMaxPublicRecommendationCount: 0,
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
    publicRecommendationPolicy: 'curation_only_zero_public_recommendations',
    publicRuntimeCallable: false,
    invocationMode: 'workflow_preprocess_required',
    defaultPayload: null,
    expectedMaxPublicRecommendationCount: 0,
    preprocessReason: 'Minnesota DNR OHV sync requires the durable GitHub workflow to download and convert the official GeoPackage into bounded GeoJSON sourceFeatures before invoking the Edge Function.',
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
    publicRecommendationPolicy: 'curation_only_zero_public_recommendations',
    publicRuntimeCallable: false,
    invocationMode: 'direct_edge_function',
    defaultPayload: {
      sourceKeys: ['tillamook_class_i', 'tillamook_class_ii_iv', 'tillamook_class_iii'],
      minMiles: 0.25,
      maxTracksPerSource: 50,
    },
    expectedMaxPublicRecommendationCount: 0,
    requiredGuards: ['sync_token', 'service_role_only', 'bounded_payload', 'public_recommendation_count'],
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
    expectedMaxPublicRecommendationCount: entry.expectedMaxPublicRecommendationCount,
    preprocessReason: entry.preprocessReason || '',
    safetyNotes: [
      'Requires ECS_ROUTE_CATALOG_SYNC_TOKEN via x-ecs-sync-token; never print or embed the sync token.',
      'Runs server-side with service-role credentials only inside the Supabase Edge Function.',
      'Uses a bounded payload so source syncs cannot accidentally ingest an unbounded national feed.',
      entry.publicRecommendationPolicy === 'curation_only_zero_public_recommendations'
        ? 'Curation-only ingestion must produce zero public recommendations until deterministic review promotes records.'
        : 'Official aggregate records may create public recommendations only behind deterministic access, limitation, and closure gates.',
    ],
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
      entry.publicRecommendationPolicy === 'curation_only_zero_public_recommendations' &&
      entry.expectedMaxPublicRecommendationCount !== 0
    ) {
      errors.push(`${entry.functionName} curation-only sync should expect zero public recommendations`);
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

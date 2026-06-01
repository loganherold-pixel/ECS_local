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
    publicRecommendationPolicy: 'curation_only_zero_public_recommendations',
    publicRuntimeCallable: false,
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
        'curl --fail-with-body',
        'concurrency:',
        'publicRecommendationCount',
      ]) {
        if (!workflowSource.includes(required)) errors.push(`${entry.functionName} workflow missing ${required}`);
      }
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
  routeCatalogDeployFunctionNames,
  routeCatalogPublicFunctionNames,
  routeCatalogSyncFunctionNames,
  validateRouteCatalogSyncInventory,
};

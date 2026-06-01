const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const {
  ROUTE_CATALOG_SYNC_INVENTORY,
  routeCatalogSyncFunctionNames,
  validateRouteCatalogSyncInventory,
} = require(path.join(root, 'scripts', 'route-catalog-sync-inventory.js'));

const expectedFunctionNames = [
  'route-catalog-sync-usfs-mvum',
  'route-catalog-sync-blm-gtlf',
  'route-catalog-sync-usgs-trails',
  'route-catalog-sync-nps-trails',
  'route-catalog-sync-michigan-orv',
  'route-catalog-sync-minnesota-ohv',
  'route-catalog-sync-oregon-odf-ohv',
];

assert.deepStrictEqual(
  routeCatalogSyncFunctionNames(),
  expectedFunctionNames,
  'Route catalog sync inventory should declare every official/open source sync function in deployment order',
);

const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const supabaseConfig = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');

function supabaseFunctionConfigSection(functionName) {
  const startToken = `[functions.${functionName}]`;
  const start = supabaseConfig.indexOf(startToken);
  if (start < 0) return '';
  const next = supabaseConfig.indexOf('\n[functions.', start + startToken.length);
  return next >= 0 ? supabaseConfig.slice(start, next) : supabaseConfig.slice(start);
}

for (const entry of ROUTE_CATALOG_SYNC_INVENTORY) {
  assert(entry.key && entry.providerId && entry.functionName, 'Inventory entries should include key, providerId, and functionName');
  assert.strictEqual(entry.publicRuntimeCallable, false, `${entry.functionName} should not be marked public-runtime callable`);
  assert(
    entry.publicRecommendationPolicy === 'aggregate_recommendable_with_closure_gate' ||
      entry.publicRecommendationPolicy === 'curation_only_zero_public_recommendations',
    `${entry.functionName} should declare a public recommendation policy`,
  );
  assert(
    entry.requiredGuards.includes('sync_token') &&
      entry.requiredGuards.includes('service_role_only') &&
      entry.requiredGuards.includes('bounded_payload') &&
      entry.requiredGuards.includes('public_recommendation_count'),
    `${entry.functionName} should declare required sync safety guards`,
  );

  const functionPath = path.join(root, entry.functionPath);
  const workflowPath = path.join(root, entry.workflowPath);
  assert(fs.existsSync(functionPath), `${entry.functionName} Edge Function should exist`);
  assert(fs.existsSync(workflowPath), `${entry.functionName} workflow should exist`);
  assert(packageJson.includes(`"${entry.adapterTestScript}"`), `${entry.functionName} adapter test script should be registered in package.json`);

  const functionSource = fs.readFileSync(functionPath, 'utf8');
  const workflowSource = fs.readFileSync(workflowPath, 'utf8');
  const configSection = `[functions.${entry.functionName}]`;
  const configEntry = supabaseFunctionConfigSection(entry.functionName);
  assert(supabaseConfig.includes(configSection), `${entry.functionName} should be registered in supabase/config.toml`);
  assert(
    configEntry.includes('enabled = true') &&
      configEntry.includes('verify_jwt = false') &&
      configEntry.includes(`entrypoint = "./functions/${entry.functionName}/index.ts"`),
    `${entry.functionName} config should enable the function with sync-token protection instead of JWT runtime auth`,
  );
  assert(functionSource.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'), `${entry.functionName} should require the sync token`);
  assert(
    functionSource.includes('ECS_SERVICE_ROLE_KEY') || functionSource.includes('SUPABASE_SERVICE_ROLE_KEY'),
    `${entry.functionName} should use service-role credentials server-side`,
  );
  assert(
    functionSource.includes('route_sources') &&
      functionSource.includes('route_source_ingest_runs') &&
      functionSource.includes('verified_routes') &&
      functionSource.includes('publicRecommendationCount'),
    `${entry.functionName} should persist route-source ingest metadata and public recommendation telemetry`,
  );
  assert(workflowSource.includes(entry.functionName), `${entry.functionName} workflow should invoke the matching Edge Function`);
  assert(workflowSource.includes('ECS_SUPABASE_URL') && workflowSource.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'));
  assert(workflowSource.includes('curl --fail-with-body'), `${entry.functionName} workflow should fail loudly on Edge Function errors`);
  assert(workflowSource.includes('concurrency:'), `${entry.functionName} workflow should avoid overlapping sync runs`);
  assert(workflowSource.includes('publicRecommendationCount'), `${entry.functionName} workflow summary should expose public recommendation telemetry`);
}

const validation = validateRouteCatalogSyncInventory(root);
assert.deepStrictEqual(validation.errors, [], 'Inventory validation should pass without drift');

console.log('Route catalog sync inventory checks passed');

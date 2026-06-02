const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-edge-functions-deploy.yml');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

const {
  routeCatalogDeployFunctionNames,
  routeCatalogPublicFunctionNames,
  routeCatalogSyncFunctionNames,
} = require(path.join(root, 'scripts', 'route-catalog-sync-inventory.js'));

assert(
  packageJson.includes('"test:route-catalog-edge-deploy"'),
  'package.json should expose the route catalog Edge Function deployment contract test',
);

assert(fs.existsSync(workflowPath), 'Route catalog Edge Functions deploy workflow should exist');

const workflow = fs.readFileSync(workflowPath, 'utf8');
const deployFunctionNames = routeCatalogDeployFunctionNames();

assert.deepStrictEqual(
  routeCatalogPublicFunctionNames(),
  ['route-catalog-search', 'route-catalog-detail', 'route-submission-intake', 'route-catalog-summary'],
  'Route catalog public runtime function inventory should include search, detail, authenticated submission intake, and summary reporting',
);

assert.deepStrictEqual(
  deployFunctionNames,
  [...routeCatalogPublicFunctionNames(), ...routeCatalogSyncFunctionNames()],
  'Route catalog deploy inventory should deploy public catalog functions before source sync functions',
);

assert(workflow.includes('name: Route Catalog Edge Functions Deploy'), 'Workflow should use the expected display name');
assert(workflow.includes('workflow_dispatch:'), 'Workflow should support manual deployment');
assert(workflow.includes('push:'), 'Workflow should run on relevant pushed function/config changes');
assert(workflow.includes('paths:'), 'Workflow should be path scoped');

for (const requiredPath of [
  'supabase/functions/route-catalog-search/**',
  'supabase/functions/route-catalog-detail/**',
  'supabase/functions/route-submission-intake/**',
  'supabase/functions/route-catalog-summary/**',
  'supabase/functions/route-catalog-sync-*/**',
  'supabase/functions/_shared/routeCatalog*.ts',
  'supabase/config.toml',
  'scripts/route-catalog-sync-inventory.js',
]) {
  assert(workflow.includes(requiredPath), `Workflow should watch ${requiredPath}`);
}

for (const required of [
  'actions/checkout@v4',
  'supabase/setup-cli@v1',
  'version: 2.75.0',
  'SUPABASE_ACCESS_TOKEN',
  'ECS_SUPABASE_PROJECT_REF',
  'Missing GitHub secret SUPABASE_ACCESS_TOKEN',
  'Missing GitHub secret ECS_SUPABASE_PROJECT_REF',
  'concurrency:',
  'Route Catalog Edge Functions Deploy',
]) {
  assert(workflow.includes(required), `Workflow missing ${required}`);
}

for (const functionName of deployFunctionNames) {
  assert(
    workflow.includes(`supabase functions deploy "${functionName}" --project-ref`),
    `${functionName} should be deployed explicitly by the workflow`,
  );
  assert(workflow.includes(`| ${functionName} |`), `${functionName} should be listed in the workflow summary`);
}

assert(
  !workflow.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN') && !workflow.includes('ECS_SUPABASE_URL'),
  'Deploy workflow should not require sync invocation secrets',
);

console.log('Route catalog Edge Function deploy workflow checks passed');

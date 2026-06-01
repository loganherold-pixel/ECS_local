const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-usfs-mvum-sync.yml');

assert(fs.existsSync(workflowPath), 'Route catalog MVUM sync runner workflow should exist');

const workflow = fs.readFileSync(workflowPath, 'utf8');

assert(workflow.includes('name: Route Catalog USFS MVUM Sync'), 'Workflow should have a clear route catalog sync name');
assert(workflow.includes('schedule:') && workflow.includes('cron:'), 'Workflow should run on a durable schedule');
assert(workflow.includes('workflow_dispatch:'), 'Workflow should support manual dispatch without a local shell token');
assert(workflow.includes('route-catalog-sync-usfs-mvum'), 'Workflow should invoke the protected USFS MVUM sync function');
assert(
  workflow.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN: ${{ secrets.ECS_ROUTE_CATALOG_SYNC_TOKEN }}'),
  'Workflow should read the sync token from GitHub secrets',
);
assert(
  workflow.includes('ECS_SUPABASE_URL: ${{ secrets.ECS_SUPABASE_URL }}'),
  'Workflow should read the Supabase URL from GitHub secrets',
);
assert(
  workflow.includes('tahoe-national-forest,mendocino-national-forest'),
  'Workflow defaults should sync the current Tahoe and Mendocino pilot forests',
);
assert(workflow.includes('limitPerForestLayer'), 'Workflow should pass bounded sync limits');
assert(workflow.includes('rawFeatureCount') && workflow.includes('aggregateRouteCount'), 'Workflow summary should report ingest counts');
assert(
  workflow.includes('current_conditions_json') &&
    workflow.includes('payload.currentConditions = JSON.parse(currentConditionsJson)'),
  'Workflow should support reviewed official closure overlays without requiring a local shell token',
);
assert(
  workflow.includes('currentConditionBlockedRouteCount'),
  'Workflow summary should report routes blocked by reviewed official current-condition overlays',
);
assert(workflow.includes('concurrency:'), 'Workflow should avoid overlapping route catalog sync runs');
assert(!workflow.includes('supabase secrets set'), 'Workflow should not rotate production secrets during routine sync');
assert(!workflow.includes('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='), 'Workflow must not embed the previous all-zero token');

console.log('Route catalog sync runner checks passed');

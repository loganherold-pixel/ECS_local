const assert = require('assert');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-usfs-mvum-sync.yml');

assert(fs.existsSync(workflowPath), 'Route catalog MVUM sync runner workflow should exist');

const workflow = fs.readFileSync(workflowPath, 'utf8');
const workflowDoc = YAML.parse(workflow);

assert.strictEqual(
  workflowDoc.name,
  'Route Catalog USFS MVUM Sync',
  'Workflow YAML should parse with the expected display name instead of falling back to the file path in GitHub Actions',
);
assert(
  workflowDoc.on?.schedule && workflowDoc.on?.workflow_dispatch,
  'Workflow YAML should parse the schedule and manual dispatch triggers',
);

assert(workflow.includes('name: Route Catalog USFS MVUM Sync'), 'Workflow should have a clear route catalog sync name');
assert(workflow.includes('schedule:') && workflow.includes('cron:'), 'Workflow should run on a durable schedule');
assert(workflow.includes('workflow_dispatch:'), 'Workflow should support manual dispatch without a local shell token');
assert(workflow.includes('sync_depth:'), 'Workflow should let operators select cautious or deep MVUM sync depth');
assert(workflow.includes('route-catalog-sync-usfs-mvum'), 'Workflow should invoke the protected USFS MVUM sync function');
assert(
  workflow.includes('Build bounded sync payloads') &&
    workflow.includes('route-catalog-usfs-mvum-sync-payloads.json') &&
    workflow.includes('forests: [forest]'),
  'Workflow should split the USFS batch into per-forest Edge Function payloads to avoid runtime timeouts',
);
assert(
  workflow.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN: ${{ secrets.ECS_ROUTE_CATALOG_SYNC_TOKEN }}'),
  'Workflow should read the sync token from GitHub secrets',
);
assert(
  workflow.includes('ECS_SUPABASE_URL: ${{ secrets.ECS_SUPABASE_URL }}'),
  'Workflow should read the Supabase URL from GitHub secrets',
);
const longestWorkflowLine = Math.max(...workflow.split(/\r?\n/).map((line) => line.length));
assert(
  longestWorkflowLine < 500,
  'Workflow dispatch UI should stay readable by avoiding giant inline forest default lines',
);
assert(
  workflow.includes('actions/checkout@v4') &&
    workflow.includes("require('./scripts/route-catalog-usfs-mvum-batches.js')") &&
    workflow.includes('resolveUsfsMvumForestSelection'),
  'Workflow should load the configured MVUM forest selection from the shared batch helper instead of embedding it in the GitHub input form',
);
assert(
  workflow.includes('Leave blank to sync the configured MVUM forest list') &&
    workflow.includes("FORESTS: ${{ inputs.forests || '' }}"),
  'Workflow dispatch should keep the forest input blank by default while still allowing explicit forest overrides',
);
assert(workflow.includes('limitPerForestLayer'), 'Workflow should pass bounded sync limits');
assert(
  workflow.includes('SYNC_DEPTH') &&
    workflow.includes('deepPagination') &&
    workflow.includes('2500') &&
    workflow.includes('cautious') &&
    workflow.includes('deep'),
  'Workflow should support opt-in deep MVUM pagination without changing the cautious scheduled default',
);
assert(workflow.includes('rawFeatureCount') && workflow.includes('aggregateRouteCount'), 'Workflow summary should report ingest counts');
assert(
  workflow.includes('publicRecommendationCount'),
  'Workflow summary should report public recommendation counts for recommendable MVUM aggregates',
);
assert(
  workflow.includes('current_conditions_json') &&
    workflow.includes('currentConditions = JSON.parse(currentConditionsJson)') &&
    workflow.includes('payload.currentConditions = currentConditions'),
  'Workflow should support reviewed official closure overlays without requiring a local shell token',
);
assert(
  workflow.includes('max_allowable_offset') &&
    workflow.includes('MAX_ALLOWABLE_OFFSET') &&
    workflow.includes('maxAllowableOffset'),
  'Workflow should pass a bounded ArcGIS geometry simplification offset to keep dense MVUM forest syncs under Edge limits',
);
assert(
  workflow.includes('--write-out "%{http_code}"') &&
    workflow.includes('route-catalog-usfs-mvum-sync-responses') &&
    workflow.includes('Response body:'),
  'Workflow should preserve bounded Edge Function failure response bodies for source sync debugging',
);
assert(
  workflow.includes('route-catalog-usfs-mvum-sync-failures.json') &&
    workflow.includes('retryLimits = [500, 150]') &&
    workflow.includes('retryPayload.deepPagination = false') &&
    workflow.includes('retryPayload.limitPerForestLayer = retryLimit'),
  'Workflow should retry dense/problem MVUM forests with smaller bounded per-layer limits before giving up',
);
assert(
  workflow.includes('failedForests.length > 0') &&
    workflow.includes('USFS MVUM route catalog sync had failed forests'),
  'Workflow should finish the remaining forests and then report any unresolved MVUM forest failures',
);
assert(
  workflow.includes('currentConditionBlockedRouteCount'),
  'Workflow summary should report routes blocked by reviewed official current-condition overlays',
);
assert(workflow.includes('concurrency:'), 'Workflow should avoid overlapping route catalog sync runs');
assert(!workflow.includes('supabase secrets set'), 'Workflow should not rotate production secrets during routine sync');
assert(!workflow.includes('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='), 'Workflow must not embed the previous all-zero token');

console.log('Route catalog sync runner checks passed');

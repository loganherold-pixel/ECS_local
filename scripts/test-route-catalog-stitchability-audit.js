const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const auditPath = path.join(root, 'scripts', 'route-catalog-stitchability-audit.js');
const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-stitchability-review-queue.yml');
const stitchGroupsSyncFunctionPath = path.join(root, 'supabase', 'functions', 'route-catalog-sync-stitch-groups', 'index.ts');
const stitchGroupsSyncWorkflowPath = path.join(root, '.github', 'workflows', 'route-catalog-stitch-groups-sync.yml');

assert(
  packageJson.includes('"test:route-catalog-stitchability-audit"'),
  'package.json should expose the route catalog stitchability audit test',
);
assert(
  packageJson.includes('"route-catalog:stitchability:audit"'),
  'package.json should expose a live route catalog stitchability audit command',
);
assert(
  packageJson.includes('"route-catalog:stitchability:queue"'),
  'package.json should expose a TripBuilder-oriented stitchability review queue command',
);
assert(
  packageJson.includes('"route-catalog:stitchability:queue:markdown"'),
  'package.json should expose an operator-readable stitchability review queue markdown command',
);
assert(
  packageJson.includes('"route-catalog:stitchability:groups:dry-run"'),
  'package.json should expose a dry-run stitch-group persistence plan command',
);
assert(fs.existsSync(auditPath), 'Route catalog stitchability audit script should exist');
assert(fs.existsSync(workflowPath), 'Route catalog stitchability review queue workflow should exist');
assert(fs.existsSync(stitchGroupsSyncFunctionPath), 'Route catalog stitch groups sync Edge Function should exist');
assert(fs.existsSync(stitchGroupsSyncWorkflowPath), 'Route catalog stitch groups sync workflow should exist');

const {
  ROUTE_CATALOG_STITCHABILITY_CLUSTERS,
  analyzeRouteStitchability,
  buildRouteCatalogStitchGroupPersistencePlan,
  buildRouteCatalogStitchGroupDrafts,
  buildRouteCatalogStitchReviewQueue,
  buildRouteCatalogStitchabilityPlan,
  formatRouteCatalogStitchReviewQueueMarkdown,
  formatRouteCatalogStitchabilityOutput,
  routeCatalogSearchUrl,
} = require(auditPath);

const clusterKeys = ROUTE_CATALOG_STITCHABILITY_CLUSTERS.map((cluster) => cluster.key);
assert.deepStrictEqual(
  clusterKeys,
  ['nm_taos', 'nm_quebradas', 'nm_angel_peak'],
  'First stitchability pass should focus on the synced New Mexico BLM clusters',
);

const plan = buildRouteCatalogStitchabilityPlan({ clusterKeys: ['nm_taos'] });
assert.strictEqual(plan.length, 1);
assert.strictEqual(plan[0].requestBody.sourceAdapter, 'blm_gtlf');
assert.strictEqual(plan[0].requestBody.includeGeometry, true);
assert.strictEqual(plan[0].requestBody.includePreviewGeometry, false);
assert.strictEqual(plan[0].requestBody.limit, 50);
assert.strictEqual(plan[0].requestBody.radiusMiles, ROUTE_CATALOG_STITCHABILITY_CLUSTERS[0].radiusMiles);

assert.strictEqual(
  routeCatalogSearchUrl('https://example.supabase.co///'),
  'https://example.supabase.co/functions/v1/route-catalog-search',
);

function route(publicId, name, coordinates) {
  return {
    public_id: publicId,
    name,
    recommendation_status: 'recommendable',
    source_records: [{ provider_id: 'blm_gtlf' }],
    route_geometry: {
      type: 'LineString',
      coordinates,
    },
  };
}

const stitchability = analyzeRouteStitchability(
  {
    key: 'fixture',
    label: 'Fixture stitchability cluster',
    maxStitchGapMeters: 250,
    touchingGapMeters: 30,
    loopGapMeters: 90,
  },
  {
    records: [
      route('a', 'A connector approach', [[-105, 36], [-105, 36.001]]),
      route('b', 'B middle connector', [[-105, 36.00115], [-105, 36.002]]),
      route('c', 'C near stitch candidate', [[-105, 36.0036], [-105, 36.004]]),
      route('loop', 'Loop candidate', [[-105.01, 36], [-105.0105, 36.0004], [-105.01005, 36.00005]]),
      route('isolated', 'Isolated segment', [[-105.08, 36.08], [-105.081, 36.081]]),
    ],
  },
);

assert.strictEqual(stitchability.routeCount, 5);
assert.strictEqual(stitchability.touchingEdgeCount, 1, 'Touching route endpoints should be counted separately from stitch candidates');
assert.strictEqual(stitchability.stitchCandidateEdgeCount, 1, 'Near route endpoints should become stitch candidates, not invented routes');
assert.strictEqual(stitchability.loopCandidateCount, 1, 'Self-closing source geometry should be identified as a loop candidate');
assert.strictEqual(stitchability.connectorCount, 1, 'Routes with two graph edges should be marked as connector candidates');
assert.strictEqual(stitchability.spurCount, 2, 'Routes with one graph edge should be marked as spurs');
assert.strictEqual(stitchability.isolatedCount, 1, 'Routes without nearby graph edges should stay isolated');
assert.strictEqual(stitchability.routeRolesByPublicId.b.role, 'connector_candidate');
assert.strictEqual(stitchability.routeRolesByPublicId.loop.role, 'loop_candidate');
assert.strictEqual(stitchability.routeRolesByPublicId.isolated.role, 'isolated');
assert.strictEqual(stitchability.candidateEdges[0].classification, 'touching');
assert(stitchability.candidateEdges[0].distanceMeters < stitchability.candidateEdges[1].distanceMeters);
assert(
  stitchability.caveats.some((caveat) => /does not invent connector geometry/i.test(caveat)),
  'Stitchability audit must keep the source/connector authority boundary visible',
);

const reviewQueue = buildRouteCatalogStitchReviewQueue([stitchability]);
assert.strictEqual(reviewQueue.length, 2, 'Review queue should expose touching joins and bridge review gaps');
assert.deepStrictEqual(
  reviewQueue.map((item) => item.status),
  ['needs_bridge_review', 'chain_ready'],
  'Queue should prioritize true bridge review gaps before already-touching joins',
);
assert.strictEqual(reviewQueue[0].clusterKey, 'fixture');
assert.strictEqual(reviewQueue[0].sourceAdapter, 'blm_gtlf');
assert.strictEqual(reviewQueue[0].from.publicId, 'b');
assert.strictEqual(reviewQueue[0].to.publicId, 'c');
assert.strictEqual(reviewQueue[0].tripBuilder.requiresVerifiedBridge, true);
assert.strictEqual(reviewQueue[0].tripBuilder.canAutoPublish, false);
assert.deepStrictEqual(reviewQueue[0].tripBuilder.selectedRoutePublicIds, ['b', 'c']);
assert(
  reviewQueue[0].requiredReview.some((gate) => /current conditions/i.test(gate)),
  'Bridge review items should require current condition review',
);
assert.strictEqual(reviewQueue[1].status, 'chain_ready');
assert.strictEqual(reviewQueue[1].tripBuilder.requiresVerifiedBridge, false);
assert.strictEqual(reviewQueue[1].tripBuilder.canAutoPublish, false);
assert(
  reviewQueue.every((item) => item.caveat.includes('does not create connector geometry')),
  'Queue items must keep the no-generated-connector boundary visible',
);

const draftGroups = buildRouteCatalogStitchGroupDrafts(reviewQueue);
assert.strictEqual(draftGroups.length, 1, 'Only chain-ready queue items should become draft stitch groups');
assert.strictEqual(draftGroups[0].clusterKey, 'fixture');
assert.strictEqual(draftGroups[0].sourceAdapter, 'blm_gtlf');
assert.deepStrictEqual(draftGroups[0].routePublicIds, ['a', 'b']);
assert.strictEqual(draftGroups[0].chainReadyEdgeCount, 1);
assert.strictEqual(draftGroups[0].bridgeReviewEdgeCount, 0);
assert.strictEqual(draftGroups[0].reviewStatus, 'draft_review_required');
assert.strictEqual(draftGroups[0].tripBuilder.canAutoPublish, false);
assert.strictEqual(draftGroups[0].tripBuilder.requiresFieldReview, true);
assert(
  draftGroups[0].requiredReview.some((gate) => /current conditions/i.test(gate)),
  'Draft stitch groups should still require current condition review',
);
assert(
  draftGroups[0].caveat.includes('does not create connector geometry'),
  'Draft stitch groups must keep the no-generated-connector boundary visible',
);
assert(
  !draftGroups[0].routePublicIds.includes('c'),
  'Routes behind bridge-review gaps must not enter draft stitch groups',
);

const queueOutput = formatRouteCatalogStitchabilityOutput([stitchability], { queue: true });
assert.strictEqual(queueOutput.mode, 'live-review-queue');
assert.strictEqual(queueOutput.summary.totalQueueItems, 2);
assert.strictEqual(queueOutput.summary.needsBridgeReviewCount, 1);
assert.strictEqual(queueOutput.summary.chainReadyCount, 1);
assert.strictEqual(queueOutput.summary.draftStitchGroupCount, 1);
assert.strictEqual(queueOutput.results, undefined, 'Queue mode should not repeat full audit results');
assert.strictEqual(queueOutput.reviewQueue.length, 2);
assert.strictEqual(queueOutput.stitchGroupDrafts.length, 1);

const persistencePlan = buildRouteCatalogStitchGroupPersistencePlan(queueOutput);
assert.strictEqual(persistencePlan.mode, 'stitch-group-persistence-dry-run');
assert.strictEqual(persistencePlan.writeEnabled, false);
assert.strictEqual(persistencePlan.requiredWriterRole, 'service_role');
assert.deepStrictEqual(persistencePlan.tables, [
  'route_catalog_stitch_groups',
  'route_catalog_stitch_group_routes',
  'route_catalog_stitch_group_edges',
]);
assert.strictEqual(persistencePlan.groups.length, 1);
assert.strictEqual(persistencePlan.groups[0].publicId, draftGroups[0].id);
assert.strictEqual(persistencePlan.groups[0].reviewStatus, 'draft_review_required');
assert.strictEqual(persistencePlan.groups[0].publicationStatus, 'review_only');
assert.strictEqual(persistencePlan.groups[0].canAutoPublish, false);
assert.deepStrictEqual(persistencePlan.groups[0].routePublicIds, ['a', 'b']);
assert.deepStrictEqual(
  persistencePlan.routes.map((route) => [route.routePublicId, route.routeOrder, route.direction]),
  [['a', 0, 'unknown'], ['b', 1, 'unknown']],
);
assert.strictEqual(persistencePlan.edges.length, 1);
assert.strictEqual(persistencePlan.edges[0].edgeStatus, 'chain_ready');
assert.strictEqual(persistencePlan.edges[0].requiresVerifiedBridge, false);
assert(
  persistencePlan.caveats.some((caveat) => /does not write/i.test(caveat)),
  'Persistence plan should say it performs no writes',
);
assert(
  persistencePlan.caveats.some((caveat) => /not public route/i.test(caveat)),
  'Persistence plan should keep draft groups out of the public route catalog',
);

const auditOutput = formatRouteCatalogStitchabilityOutput([stitchability], { queue: false });
assert.strictEqual(auditOutput.mode, 'live-audit');
assert.strictEqual(auditOutput.results.length, 1);
assert.strictEqual(auditOutput.reviewQueue, undefined, 'Audit mode should not include queue items unless requested');

const markdown = formatRouteCatalogStitchReviewQueueMarkdown(queueOutput);
assert(markdown.includes('## Route Catalog Stitchability Review Queue'), 'Markdown report should have a clear title');
assert(markdown.includes('Total queue items: 2'), 'Markdown report should include total queue count');
assert(markdown.includes('Needs bridge review: 1'), 'Markdown report should include bridge review count');
assert(markdown.includes('Chain-ready joins: 1'), 'Markdown report should include chain-ready count');
assert(markdown.includes('### Needs Bridge Review'), 'Markdown report should separate true bridge gaps');
assert(markdown.includes('### Chain-Ready Source Joins'), 'Markdown report should separate touching source joins');
assert(markdown.includes('### Draft Stitch Groups'), 'Markdown report should include draft stitch groups');
assert(markdown.includes('B middle connector'), 'Markdown report should include route names');
assert(markdown.includes('C near stitch candidate'), 'Markdown report should include stitch candidate route names');
assert(markdown.includes('does not create connector geometry'), 'Markdown report must keep the connector boundary visible');
assert(markdown.includes('Auto-publish: no'), 'Markdown report must show queue items are not auto-published');
assert(markdown.includes('current conditions'), 'Markdown report must keep current condition review visible');
assert(markdown.includes('draft_review_required'), 'Markdown report should keep draft review status visible');

const workflow = fs.readFileSync(workflowPath, 'utf8');
for (const required of [
  'name: Route Catalog Stitchability Review Queue',
  'workflow_dispatch:',
  'workflow_run:',
  'Route Catalog BLM GTLF Sync',
  'schedule:',
  'concurrency:',
  'group: route-catalog-data-plane-${{ github.repository }}',
  'cancel-in-progress: false',
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'Run Route Catalog Stitchability Review Queue',
  'npm run route-catalog:stitchability:queue',
  'formatRouteCatalogStitchReviewQueueMarkdown',
  'extractJsonPayloadFromOutput(raw, \'Route catalog stitchability review queue output\')',
  'GITHUB_STEP_SUMMARY',
  'route-catalog-stitchability-review-queue.md',
  'route-catalog-stitchability-review-queue.json',
  'actions/upload-artifact@v4',
]) {
  assert(workflow.includes(required), `Stitchability review queue workflow should include ${required}`);
}
assert(
  !workflow.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN') &&
    !workflow.includes('SUPABASE_ACCESS_TOKEN') &&
    !workflow.includes('ECS_SERVICE_ROLE_KEY') &&
    !workflow.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'Stitchability review queue workflow should not require sync, deploy, or service-role secrets',
);

const stitchGroupsSyncFunction = fs.readFileSync(stitchGroupsSyncFunctionPath, 'utf8');
for (const required of [
  'ECS_ROUTE_CATALOG_SYNC_TOKEN',
  'x-ecs-sync-token',
  'ECS_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  "from('verified_routes')",
  "from('route_catalog_stitch_groups')",
  "from('route_catalog_stitch_group_routes')",
  "from('route_catalog_stitch_group_edges')",
  'confirmWriteReviewOnly',
  'writeEnabled === false',
  'publicRecommendationCount: 0',
  'review_only',
  'can_auto_publish: false',
]) {
  assert(stitchGroupsSyncFunction.includes(required), `Stitch group sync function should include ${required}`);
}
assert(
  !stitchGroupsSyncFunction.includes("from('route_catalog_public')") &&
    !stitchGroupsSyncFunction.includes("recommendation_status: 'recommendable'"),
  'Stitch group sync function should not write public catalog recommendations',
);

const stitchGroupsSyncWorkflow = fs.readFileSync(stitchGroupsSyncWorkflowPath, 'utf8');
for (const required of [
  'name: Route Catalog Stitch Groups Sync',
  'workflow_dispatch:',
  'confirm_write:',
  'ECS_SUPABASE_URL',
  'ECS_ROUTE_CATALOG_SYNC_TOKEN',
  'npm run route-catalog:stitchability:groups:dry-run',
  'route-catalog-sync-stitch-groups',
  'x-ecs-sync-token',
  'publicRecommendationCount',
  'concurrency:',
]) {
  assert(stitchGroupsSyncWorkflow.includes(required), `Stitch group sync workflow should include ${required}`);
}

console.log('Route catalog stitchability audit checks passed.');

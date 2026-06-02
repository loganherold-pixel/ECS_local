const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const functionPath = path.join(root, 'supabase', 'functions', 'route-catalog-summary', 'index.ts');
const reportScriptPath = path.join(root, 'scripts', 'route-catalog-summary-report.js');
const workflowPath = path.join(root, '.github', 'workflows', 'route-catalog-summary-report.yml');
const supabaseConfigPath = path.join(root, 'supabase', 'config.toml');
const deployWorkflowPath = path.join(root, '.github', 'workflows', 'route-catalog-edge-functions-deploy.yml');

const {
  routeCatalogPublicFunctionNames,
} = require(path.join(root, 'scripts', 'route-catalog-sync-inventory.js'));

assert(packageJson.includes('"test:route-catalog-summary-report"'), 'package.json should expose the summary report contract test');
assert(
  packageJson.includes('"route-catalog:summary:dry-run"'),
  'package.json should expose a dry-run catalog summary command',
);
assert(
  packageJson.includes('"route-catalog:summary:report"'),
  'package.json should expose a live catalog summary report command',
);
assert(
  routeCatalogPublicFunctionNames().includes('route-catalog-summary'),
  'Route catalog public function inventory should include the summary endpoint',
);

assert(fs.existsSync(functionPath), 'Route catalog summary Edge Function should exist');
assert(fs.existsSync(reportScriptPath), 'Route catalog summary report script should exist');
assert(fs.existsSync(workflowPath), 'Route catalog summary report workflow should exist');

const functionSource = fs.readFileSync(functionPath, 'utf8');
for (const required of [
  'route_sources',
  'route_source_ingest_runs',
  'route_raw_source_features',
  'verified_routes',
  'verified_route_sources',
  'sourceSummaries',
  'recommendationStatusCounts',
  'verificationStatusCounts',
  'reviewStatusCounts',
  'publicRecommendationCount',
  'curationOnlyCount',
  'staleRouteCount',
  'activeClosureRouteCount',
  'rawFeatureCount',
  'latestIngestRun',
  'generatedAt',
  'maxRouteRows',
]) {
  assert(functionSource.includes(required), `Route catalog summary function should include ${required}`);
}
assert(
  functionSource.includes('ECS_SERVICE_ROLE_KEY') || functionSource.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'Route catalog summary function should use service-role credentials server-side',
);
assert(
  !functionSource.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN'),
  'Route catalog summary function must not require the protected source-sync token',
);
assert(
  !functionSource.includes('route_geometry'),
  'Route catalog summary function must not select or expose route geometry',
);
assert(
  functionSource.includes("maxRouteRows,\n        'id'") &&
    !functionSource.includes("maxRouteRows,\n        'updated_at'"),
  'Route catalog summary should page verified_routes by indexed primary key instead of sorting broad catalog reads by updated_at',
);
assert(
  functionSource.includes('fetchRouteSourceLinksForRoutes'),
  'Route catalog summary should fetch source links only for sampled verified route IDs',
);
assert(
  !functionSource.includes("maxLinkRows,\n        'last_verified_at'"),
  'Route catalog summary should not sweep verified_route_sources ordered by unindexed freshness columns',
);
assert(
  functionSource.includes('params.maxRouteRows ?? params.max_route_rows, 1000, 100000') &&
    functionSource.includes('params.maxLinkRows ?? params.max_link_rows, 5000, 200000') &&
    functionSource.includes('params.maxIngestRunRows ?? params.max_ingest_run_rows, 500, 20000'),
  'Route catalog summary function default limits should be safe for direct large-catalog invocations',
);

const supabaseConfig = fs.readFileSync(supabaseConfigPath, 'utf8');
const configSectionStart = supabaseConfig.indexOf('[functions.route-catalog-summary]');
assert(configSectionStart >= 0, 'route-catalog-summary should be registered in supabase/config.toml');
const configSectionEnd = supabaseConfig.indexOf('\n[functions.', configSectionStart + 1);
const configSection = configSectionEnd >= 0
  ? supabaseConfig.slice(configSectionStart, configSectionEnd)
  : supabaseConfig.slice(configSectionStart);
assert(configSection.includes('enabled = true'), 'route-catalog-summary should be enabled');
assert(configSection.includes('verify_jwt = false'), 'route-catalog-summary should be public-read with publishable-key invocation');
assert(
  configSection.includes('entrypoint = "./functions/route-catalog-summary/index.ts"'),
  'route-catalog-summary config entrypoint should point at the function',
);

const reportScript = fs.readFileSync(reportScriptPath, 'utf8');
for (const required of [
  'loadRouteCatalogEnv',
  'route-catalog-summary',
  '--dry-run',
  '--json',
  '--timeout-ms',
  'AbortSignal.timeout',
  'failurePayloadForSummary',
  'sourceSummaries',
  'publicRecommendationCount',
  'curationOnlyCount',
  'staleRouteCount',
]) {
  assert(reportScript.includes(required), `Route catalog summary script should include ${required}`);
}
assert(
  !reportScript.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN') &&
    !reportScript.includes('ECS_SERVICE_ROLE_KEY') &&
    !reportScript.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'Route catalog summary script should not load sync or service-role secrets',
);

const {
  buildRequestBody,
  extractJsonPayloadFromOutput,
  failurePayloadForSummary,
  formatSummaryMarkdown,
  formatWorkflowSummaryMarkdown,
  parseArgs,
  routeCatalogSummaryUrl,
} = require(reportScriptPath);
assert.strictEqual(
  routeCatalogSummaryUrl('https://example.supabase.co'),
  'https://example.supabase.co/functions/v1/route-catalog-summary',
  'Summary script should build the public Edge Function URL',
);
assert.deepStrictEqual(
  buildRequestBody(parseArgs([])),
  {
    maxRouteRows: 1000,
    maxLinkRows: 5000,
    maxIngestRunRows: 500,
  },
  'Summary script default live report limits should be safe for large catalogs',
);
assert.strictEqual(
  parseArgs([]).timeoutMs,
  60000,
  'Summary script should use a bounded default request timeout',
);
assert.strictEqual(
  parseArgs(['--timeout-ms', '15000']).timeoutMs,
  15000,
  'Summary script should allow workflow-specific request timeout tuning',
);
assert.deepStrictEqual(
  extractJsonPayloadFromOutput('notice {not json}\n{"ok":true,"totals":{"routeCount":3}}\ntrailing log', 'summary report'),
  { ok: true, totals: { routeCount: 3 } },
  'Summary script should extract the first valid JSON object from noisy workflow output',
);
assert.throws(
  () => extractJsonPayloadFromOutput('plain text only', 'summary report'),
  /summary report did not contain JSON/,
  'Summary script should report missing JSON clearly',
);
const failurePayload = failurePayloadForSummary(
  new Error('The operation was aborted due to timeout'),
  parseArgs(['--timeout-ms', '15000', '--max-route-rows', '1', '--max-link-rows', '1', '--max-ingest-run-rows', '1']),
  { ECS_SUPABASE_URL: 'https://example.supabase.co' },
);
assert.strictEqual(failurePayload.ok, false, 'Failure payload should mark summary response as failed');
assert.strictEqual(failurePayload.timeoutMs, 15000, 'Failure payload should preserve request timeout');
const failureMarkdown = formatWorkflowSummaryMarkdown(failurePayload);
assert(failureMarkdown.includes('Status: failed'), 'Workflow summary should render failed summary status');
assert(
  failureMarkdown.includes('The operation was aborted due to timeout'),
  'Workflow summary should render failed summary error detail',
);
const markdown = formatSummaryMarkdown({
  generatedAt: '2026-06-01T00:00:00.000Z',
  totals: {
    routeCount: 7,
    publicRecommendationCount: 5,
    curationOnlyCount: 2,
    staleRouteCount: 1,
    activeClosureRouteCount: 0,
    rawFeatureCount: 11,
  },
  recommendationStatusCounts: {
    recommendable: 5,
    source_backed_curation_only: 2,
  },
  verificationStatusCounts: {
    verified: 5,
    needs_review: 2,
  },
  reviewStatusCounts: {
    approved: 5,
    pending_review: 2,
  },
  sourceSummaries: [
    {
      providerId: 'usfs_mvum',
      name: 'USFS MVUM',
      authority: 'official_access',
      routeCount: 7,
      publicRecommendationCount: 5,
      curationOnlyCount: 2,
      staleRouteCount: 1,
      activeClosureRouteCount: 0,
      rawFeatureCount: 11,
      latestIngestRun: { status: 'succeeded', finishedAt: '2026-06-01T00:00:00.000Z' },
    },
  ],
});
assert(markdown.includes('Route Catalog Summary Report'), 'Markdown formatter should title the report');
assert(markdown.includes('Public recommendations'), 'Markdown formatter should expose public recommendation totals');
assert(markdown.includes('| usfs_mvum |'), 'Markdown formatter should include per-source rows');
const workflowMarkdown = formatWorkflowSummaryMarkdown({
  generatedAt: '2026-06-01T00:00:00.000Z',
  limits: {
    maxRouteRows: 1000,
    maxLinkRows: 5000,
    maxIngestRunRows: 500,
  },
  truncated: {
    routeSources: false,
    verifiedRoutes: true,
    verifiedRouteSources: true,
    ingestRuns: false,
  },
  totals: {
    routeCount: 7,
    publicRecommendationCount: 5,
    curationOnlyCount: 2,
    staleRouteCount: 1,
    activeClosureRouteCount: 0,
    rawFeatureCount: 11,
  },
  recommendationStatusCounts: {
    recommendable: 5,
    source_backed_curation_only: 2,
  },
  verificationStatusCounts: {
    verified: 5,
    needs_review: 2,
  },
  reviewStatusCounts: {
    approved: 5,
    pending_review: 2,
  },
  sourceSummaries: [
    {
      providerId: 'usfs_mvum',
      authority: 'official_access',
      routeCount: 7,
      publicRecommendationCount: 5,
      curationOnlyCount: 2,
      staleRouteCount: 1,
      activeClosureRouteCount: 0,
      rawFeatureCount: 11,
    },
  ],
});
assert(workflowMarkdown.includes('Sources: 1'), 'Workflow summary should include source count');
assert(
  workflowMarkdown.includes('Report limits: routes 1,000; route-source links 5,000; ingest runs 500'),
  'Workflow summary should expose large-catalog report limits',
);
assert(
  workflowMarkdown.includes('Truncated: verified routes yes; route-source links yes; ingest runs no'),
  'Workflow summary should expose when sampled rows were truncated',
);
assert(workflowMarkdown.includes('Stale route count: 1'), 'Workflow summary should include stale route count');
assert(workflowMarkdown.includes('### Recommendation statuses'), 'Workflow summary should include recommendation status counts');
assert(workflowMarkdown.includes('| recommendable | 5 |'), 'Workflow summary should include individual recommendation status rows');
assert(workflowMarkdown.includes('### Verification statuses'), 'Workflow summary should include verification status counts');
assert(workflowMarkdown.includes('### Review statuses'), 'Workflow summary should include review status counts');

const workflow = fs.readFileSync(workflowPath, 'utf8');
for (const required of [
  'name: Route Catalog Summary Report',
  'workflow_dispatch:',
  'schedule:',
  'workflow_run:',
  'Route Catalog USFS MVUM Sync',
  'Route Catalog BLM GTLF Sync',
  'Route Catalog Michigan ORV Sync',
  'Route Catalog Minnesota OHV Sync',
  'Route Catalog Oregon ODF OHV Sync',
  'Route Catalog USGS Trails Sync',
  'Route Catalog NPS Trails Sync',
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'node ./scripts/route-catalog-summary-report.js --json --timeout-ms 60000 --max-route-rows 1000 --max-link-rows 5000 --max-ingest-run-rows 500',
  'Route Catalog Summary Report',
  'extractJsonPayloadFromOutput',
  'formatWorkflowSummaryMarkdown',
  'concurrency:',
]) {
  assert(workflow.includes(required), `Route catalog summary workflow should include ${required}`);
}
assert(
  !workflow.includes('ECS_ROUTE_CATALOG_SYNC_TOKEN') &&
    !workflow.includes('SUPABASE_ACCESS_TOKEN') &&
    !workflow.includes('ECS_SERVICE_ROLE_KEY') &&
    !workflow.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'Route catalog summary workflow should not require sync, deploy, or service-role secrets',
);

const deployWorkflow = fs.readFileSync(deployWorkflowPath, 'utf8');
assert(
  deployWorkflow.includes('supabase/functions/route-catalog-summary/**'),
  'Deploy workflow should watch the summary Edge Function path',
);
assert(
  deployWorkflow.includes('supabase functions deploy "route-catalog-summary" --project-ref'),
  'Deploy workflow should deploy the summary Edge Function',
);
assert(
  deployWorkflow.includes('| route-catalog-summary |'),
  'Deploy workflow summary should list the summary Edge Function',
);

console.log('Route catalog summary report checks passed');

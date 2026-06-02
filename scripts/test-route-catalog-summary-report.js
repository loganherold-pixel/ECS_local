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
const summaryRpcMigrationPath = path.join(root, 'supabase', 'migrations', '032_route_catalog_summary_rpc.sql');
const operatorReportingMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '033_route_catalog_operator_reporting.sql',
);
const operatorHealthVerificationMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '034_route_catalog_operator_health_verification_scope.sql',
);

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
assert(fs.existsSync(summaryRpcMigrationPath), 'Route catalog summary RPC migration should exist');
assert(fs.existsSync(operatorReportingMigrationPath), 'Route catalog operator reporting migration should exist');
assert(
  fs.existsSync(operatorHealthVerificationMigrationPath),
  'Route catalog operator verification health migration should exist',
);

const summaryRpcMigration = fs.readFileSync(summaryRpcMigrationPath, 'utf8');
for (const required of [
  'create or replace function public.route_catalog_summary_report',
  'p_max_route_rows',
  'p_max_link_rows',
  'p_max_ingest_run_rows',
  'jsonb_build_object',
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
  'route_sources',
  'route_source_ingest_runs',
  'route_raw_source_features',
  'verified_routes',
  'verified_route_sources',
]) {
  assert(summaryRpcMigration.includes(required), `Route catalog summary RPC migration should include ${required}`);
}
assert(
  summaryRpcMigration.includes('security definer'),
  'Route catalog summary RPC should run as a controlled database-side aggregate',
);
assert(
  !summaryRpcMigration.includes('route_geometry'),
  'Route catalog summary RPC must not select or expose route geometry',
);

const functionSource = fs.readFileSync(functionPath, 'utf8');
for (const required of [
  'route_catalog_summary_report',
  '.rpc(',
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
  'operatorReport',
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
  !functionSource.includes('fetchPagedRows') &&
    !functionSource.includes("from('verified_routes')") &&
    !functionSource.includes("from('verified_route_sources')"),
  'Route catalog summary Edge Function should not page broad route catalog tables directly',
);
assert(
  summaryRpcMigration.includes('sampled_routes') &&
    summaryRpcMigration.includes('limited_route_links') &&
    summaryRpcMigration.includes('l.verified_route_id = r.id'),
  'Route catalog summary RPC should fetch source links only for sampled verified route IDs',
);
assert(
  !summaryRpcMigration.includes('order by last_verified_at'),
  'Route catalog summary RPC should not sweep verified_route_sources ordered by unindexed freshness columns',
);

const operatorReportingMigration = fs.readFileSync(operatorReportingMigrationPath, 'utf8');
for (const required of [
  'create or replace function public.route_catalog_summary_report',
  'operatorReport',
  'routeCountsBySource',
  'postureTotals',
  'staleSources',
  'failedSyncAreas',
  'lastVerified',
  'lastVerifiedAt',
  'oldestVerifiedAt',
]) {
  assert(operatorReportingMigration.includes(required), `Route catalog operator report migration should include ${required}`);
}
const operatorHealthVerificationMigration = fs.readFileSync(operatorHealthVerificationMigrationPath, 'utf8');
for (const required of [
  'create or replace function public.route_catalog_summary_report',
  'operatorReport',
  'lastVerified',
  'sourceCountMissingVerification',
  'sourceCountVerificationNotApplicable',
]) {
  assert(
    operatorHealthVerificationMigration.includes(required),
    `Route catalog operator verification health migration should include ${required}`,
  );
}
assert(
  operatorHealthVerificationMigration.includes('where route_count > 0 and last_verified_at is null'),
  'Route catalog operator verification health migration should only count route-bearing sources as missing verification timestamps',
);
assert(
  !operatorReportingMigration.includes('route_geometry'),
  'Route catalog operator report migration must not select or expose route geometry',
);
assert(
  !operatorHealthVerificationMigration.includes('route_geometry'),
  'Route catalog operator verification health migration must not select or expose route geometry',
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
  'buildOperatorReport',
  'routeCountsBySource',
  'failedSyncAreas',
  'lastVerified',
  'sourceCountVerificationNotApplicable',
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
  buildOperatorHealth,
  buildRequestBody,
  buildWorkflowRunTriggerHealth,
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
assert.deepStrictEqual(
  buildOperatorHealth({
    totals: { publicRecommendationCount: 7, curationOnlyCount: 0 },
    operatorReport: {
      postureTotals: { publicRecommendationCount: 7, curationOnlyCount: 0 },
      staleSources: [],
      failedSyncAreas: [],
      lastVerified: {
        sourceCountWithVerification: 2,
        sourceCountMissingVerification: 0,
      },
    },
  }),
  {
    status: 'healthy',
    reasons: ['No stale sources, failed sync areas, or missing source verification timestamps detected.'],
  },
  'Operator health should be healthy when sources are fresh, verified, and sync-clean',
);
assert.strictEqual(
  buildOperatorHealth({
    totals: { publicRecommendationCount: 7, curationOnlyCount: 3 },
    operatorReport: {
      postureTotals: { publicRecommendationCount: 7, curationOnlyCount: 3 },
      staleSources: [{ providerId: 'oregon_odf_ohv', staleRouteCount: 4 }],
      failedSyncAreas: [],
      lastVerified: {
        sourceCountWithVerification: 1,
        sourceCountMissingVerification: 1,
      },
    },
  }).status,
  'watch',
  'Operator health should be watch when stale sources or missing verification timestamps exist without failed syncs',
);
assert.deepStrictEqual(
  buildOperatorHealth({
    totals: { publicRecommendationCount: 7, curationOnlyCount: 0 },
    sourceSummaries: [
      {
        providerId: 'placeholder_context',
        name: 'Placeholder Context Source',
        status: 'active',
        authority: 'agency_context',
        routeCount: 0,
        publicRecommendationCount: 0,
        curationOnlyCount: 0,
        lastVerifiedAt: null,
      },
      {
        providerId: 'verified_source',
        name: 'Verified Source',
        status: 'active',
        authority: 'official_access',
        routeCount: 7,
        publicRecommendationCount: 7,
        curationOnlyCount: 0,
        lastVerifiedAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  }),
  {
    status: 'healthy',
    reasons: ['No stale sources, failed sync areas, or missing source verification timestamps detected.'],
  },
  'Operator health should not warn on zero-route placeholder or context sources missing verification timestamps',
);
assert.strictEqual(
  buildOperatorHealth({
    totals: { publicRecommendationCount: 0, curationOnlyCount: 1 },
    sourceSummaries: [
      {
        providerId: 'routeful_missing_verification',
        name: 'Routeful Missing Verification',
        status: 'active',
        authority: 'official_access',
        routeCount: 1,
        publicRecommendationCount: 0,
        curationOnlyCount: 1,
        lastVerifiedAt: null,
      },
    ],
  }).status,
  'watch',
  'Operator health should still warn when a route-bearing source lacks verification timestamps',
);
assert.strictEqual(
  buildOperatorHealth({
    totals: { publicRecommendationCount: 0, curationOnlyCount: 4 },
    operatorReport: {
      postureTotals: { publicRecommendationCount: 0, curationOnlyCount: 4 },
      staleSources: [{ providerId: 'oregon_odf_ohv', staleRouteCount: 4 }],
      failedSyncAreas: [{ providerId: 'oregon_odf_ohv', status: 'failed', errorMessage: 'provider timeout' }],
      lastVerified: {
        sourceCountWithVerification: 0,
        sourceCountMissingVerification: 1,
      },
    },
  }).status,
  'critical',
  'Operator health should be critical when failed sync areas are present',
);
assert.deepStrictEqual(
  buildWorkflowRunTriggerHealth('workflow_dispatch', {}),
  { status: 'healthy', reasons: [] },
  'Manual summary runs should not add upstream workflow-run health reasons',
);
assert.deepStrictEqual(
  buildWorkflowRunTriggerHealth('workflow_run', {
    workflow_run: {
      name: 'Route Catalog USFS MVUM Sync',
      conclusion: 'success',
    },
  }),
  { status: 'healthy', reasons: [] },
  'Successful upstream sync workflow runs should not degrade summary health',
);
assert.deepStrictEqual(
  buildWorkflowRunTriggerHealth('workflow_run', {
    workflow_run: {
      name: 'Route Catalog Oregon ODF OHV Sync',
      conclusion: 'failure',
      html_url: 'https://github.example/actions/runs/123',
    },
  }),
  {
    status: 'critical',
    reasons: ['Trigger workflow Route Catalog Oregon ODF OHV Sync completed with failure: https://github.example/actions/runs/123'],
  },
  'Failed upstream sync workflow runs should be critical even before the source adapter records a failed ingest run',
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
      lastVerifiedAt: '2026-06-01T00:00:00.000Z',
      latestIngestRun: { status: 'succeeded', finishedAt: '2026-06-01T00:00:00.000Z' },
    },
    {
      providerId: 'oregon_odf_ohv',
      name: 'Oregon ODF OHV',
      authority: 'official_access',
      routeCount: 4,
      publicRecommendationCount: 0,
      curationOnlyCount: 4,
      staleRouteCount: 4,
      activeClosureRouteCount: 0,
      rawFeatureCount: 47,
      lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      latestIngestRun: {
        status: 'failed',
        finishedAt: '2026-06-01T01:00:00.000Z',
        errorMessage: 'provider timeout',
      },
    },
  ],
});
assert(markdown.includes('Route Catalog Summary Report'), 'Markdown formatter should title the report');
assert(markdown.includes('Public recommendations'), 'Markdown formatter should expose public recommendation totals');
assert(markdown.includes('| usfs_mvum |'), 'Markdown formatter should include per-source rows');
assert(markdown.includes('### Operator Report'), 'Markdown formatter should include the operator report section');
assert(markdown.includes('### Route counts by source'), 'Markdown formatter should include source route counts section');
assert(markdown.includes('### Failed sync areas'), 'Markdown formatter should include failed sync areas section');
assert(markdown.includes('provider timeout'), 'Markdown formatter should include failed sync error detail');
assert(markdown.includes('Latest verified: 2026-06-01T00:00:00.000Z'), 'Markdown formatter should include latest verified timestamp');
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
      name: 'USFS MVUM',
      authority: 'official_access',
      routeCount: 7,
      publicRecommendationCount: 5,
      curationOnlyCount: 2,
      staleRouteCount: 1,
      activeClosureRouteCount: 0,
      rawFeatureCount: 11,
      lastVerifiedAt: '2026-06-01T00:00:00.000Z',
      latestIngestRun: { status: 'succeeded', finishedAt: '2026-06-01T00:00:00.000Z' },
    },
    {
      providerId: 'oregon_odf_ohv',
      name: 'Oregon ODF OHV',
      authority: 'official_access',
      routeCount: 4,
      publicRecommendationCount: 0,
      curationOnlyCount: 4,
      staleRouteCount: 4,
      activeClosureRouteCount: 0,
      rawFeatureCount: 47,
      lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      latestIngestRun: {
        status: 'failed',
        finishedAt: '2026-06-01T01:00:00.000Z',
        errorMessage: 'provider timeout',
      },
    },
  ],
});
assert(workflowMarkdown.includes('Sources: 2'), 'Workflow summary should include source count');
assert(
  workflowMarkdown.includes('Report limits: routes 1,000; route-source links 5,000; ingest runs 500'),
  'Workflow summary should expose large-catalog report limits',
);
assert(
  workflowMarkdown.includes('Truncated: verified routes yes; route-source links yes; ingest runs no'),
  'Workflow summary should expose when sampled rows were truncated',
);
assert(workflowMarkdown.includes('Stale route count: 1'), 'Workflow summary should include stale route count');
assert(workflowMarkdown.includes('Operator health: critical'), 'Workflow summary should include operator health posture');
assert(
  workflowMarkdown.includes('Failed latest sync areas: 1'),
  'Workflow summary should include failed latest sync area count in operator health reasons',
);
assert(workflowMarkdown.includes('### Recommendation statuses'), 'Workflow summary should include recommendation status counts');
assert(workflowMarkdown.includes('| recommendable | 5 |'), 'Workflow summary should include individual recommendation status rows');
assert(workflowMarkdown.includes('### Verification statuses'), 'Workflow summary should include verification status counts');
assert(workflowMarkdown.includes('### Review statuses'), 'Workflow summary should include review status counts');
assert(workflowMarkdown.includes('### Operator Report'), 'Workflow summary should include operator report');
assert(
  workflowMarkdown.includes('| oregon_odf_ohv | Oregon ODF OHV | official_access | 4 | 0 | 4 |'),
  'Workflow summary should include route counts by source with public vs curation-only split',
);
assert(
  workflowMarkdown.includes('| oregon_odf_ohv | failed | 2026-06-01T01:00:00.000Z | provider timeout |'),
  'Workflow summary should include failed sync areas and error detail',
);
assert(
  workflowMarkdown.includes('Latest verified: 2026-06-01T00:00:00.000Z'),
  'Workflow summary should include operator last verified timestamp',
);

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
  'Route Catalog Colorado CPW Trails Sync',
  'Route Catalog USGS Trails Sync',
  'Route Catalog NPS Trails Sync',
  'ECS_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'node ./scripts/route-catalog-summary-report.js --json --timeout-ms 60000 --max-route-rows 1000 --max-link-rows 5000 --max-ingest-run-rows 500',
  'Route Catalog Summary Report',
  'extractJsonPayloadFromOutput',
  'formatWorkflowSummaryMarkdown',
  'buildOperatorHealth',
  'buildWorkflowRunTriggerHealth',
  'GITHUB_EVENT_NAME',
  'GITHUB_EVENT_PATH',
  'Route catalog trigger workflow health is critical',
  '::warning::Route catalog operator health is watch',
  '::error::Route catalog operator health is critical',
  "if (operatorHealth.status === 'critical')",
  "process.exit(1)",
  'concurrency:',
]) {
  assert(workflow.includes(required), `Route catalog summary workflow should include ${required}`);
}
assert(
  !workflow.includes("github.event.workflow_run.conclusion == 'success'"),
  'Route catalog summary workflow should run after failed sync workflow completions so operator health can catch critical source issues',
);
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

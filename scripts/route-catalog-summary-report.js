#!/usr/bin/env node
const { inspect } = require('util');
const { loadRouteCatalogEnv } = require('./route-catalog-env.js');

const DEFAULT_MAX_ROUTE_ROWS = 1000;
const DEFAULT_MAX_LINK_ROWS = 5000;
const DEFAULT_MAX_INGEST_RUN_ROWS = 500;
const DEFAULT_TIMEOUT_MS = 60000;

function usage() {
  return [
    'Usage: node scripts/route-catalog-summary-report.js [options]',
    '',
    'Options:',
    '  --dry-run                 Print endpoint/env/request metadata without calling Supabase',
    '  --json                    Print JSON instead of Markdown',
    `  --max-route-rows <n>      Cap route rows read by the Edge Function (default ${DEFAULT_MAX_ROUTE_ROWS})`,
    `  --max-link-rows <n>       Cap route-source link rows read by the Edge Function (default ${DEFAULT_MAX_LINK_ROWS})`,
    `  --max-ingest-run-rows <n> Cap ingest run rows read by the Edge Function (default ${DEFAULT_MAX_INGEST_RUN_ROWS})`,
    `  --timeout-ms <n>          Abort the summary request after this many ms (default ${DEFAULT_TIMEOUT_MS})`,
    '  --help                    Show this help',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    json: false,
    maxRouteRows: DEFAULT_MAX_ROUTE_ROWS,
    maxLinkRows: DEFAULT_MAX_LINK_ROWS,
    maxIngestRunRows: DEFAULT_MAX_INGEST_RUN_ROWS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--max-route-rows') options.maxRouteRows = readPositiveInteger(argv[++index], 'max-route-rows');
    else if (arg === '--max-link-rows') options.maxLinkRows = readPositiveInteger(argv[++index], 'max-link-rows');
    else if (arg === '--max-ingest-run-rows') options.maxIngestRunRows = readPositiveInteger(argv[++index], 'max-ingest-run-rows');
    else if (arg === '--timeout-ms') options.timeoutMs = readPositiveInteger(argv[++index], 'timeout-ms');
    else throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
  }

  return options;
}

function readPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`--${label} requires a positive number`);
  return Math.round(number);
}

function resolveSupabaseUrl(env) {
  return env.ECS_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '';
}

function resolveAnonKey(env) {
  return env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
}

function routeCatalogSummaryUrl(supabaseUrl) {
  return `${String(supabaseUrl || '').replace(/\/+$/, '')}/functions/v1/route-catalog-summary`;
}

function headersForSummary(anonKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (anonKey) {
    headers.apikey = anonKey;
    headers.authorization = `Bearer ${anonKey}`;
  }
  return headers;
}

function buildRequestBody(options) {
  return {
    maxRouteRows: options.maxRouteRows,
    maxLinkRows: options.maxLinkRows,
    maxIngestRunRows: options.maxIngestRunRows,
  };
}

function failurePayloadForSummary(error, options, env) {
  const supabaseUrl = resolveSupabaseUrl(env);
  const message = error && error.message ? error.message : String(error || 'Unknown route catalog summary error');
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    error: message,
    endpoint: supabaseUrl ? routeCatalogSummaryUrl(supabaseUrl) : '(missing)',
    limits: buildRequestBody(options),
    timeoutMs: options.timeoutMs,
  };
}

function formatCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : '0';
}

function formatLatestIngest(run) {
  if (!run || typeof run !== 'object') return 'none';
  const status = run.status || 'unknown';
  const finishedAt = run.finishedAt || run.finished_at || run.startedAt || run.started_at || '';
  return finishedAt ? `${status} @ ${finishedAt}` : String(status);
}

function formatBoolean(value) {
  return value ? 'yes' : 'no';
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readSourceProviderId(source) {
  return source.providerId || source.provider_id || source.id || 'unknown';
}

function readLatestSyncAt(run) {
  if (!run || typeof run !== 'object') return null;
  return run.finishedAt || run.finished_at || run.startedAt || run.started_at || null;
}

function failedSyncStatus(status) {
  const value = String(status || '').toLowerCase();
  return ['failed', 'failure', 'error', 'errored', 'cancelled', 'canceled', 'aborted', 'timed_out', 'timeout'].includes(value);
}

function maxIsoTimestamp(values) {
  const valid = values.filter(Boolean).map(String).sort();
  return valid.length > 0 ? valid[valid.length - 1] : null;
}

function minIsoTimestamp(values) {
  const valid = values.filter(Boolean).map(String).sort();
  return valid.length > 0 ? valid[0] : null;
}

function buildOperatorReport(summary) {
  const existing = readRecord(summary && summary.operatorReport);
  const totals = readRecord(summary && summary.totals);
  const sourceSummaries = Array.isArray(summary && summary.sourceSummaries) ? summary.sourceSummaries : [];

  const routeCountsBySource = Array.isArray(existing.routeCountsBySource)
    ? existing.routeCountsBySource
    : sourceSummaries.map((source) => {
        const latestIngestRun = readRecord(source.latestIngestRun || source.latest_ingest_run);
        return {
          providerId: readSourceProviderId(source),
          name: source.name || readSourceProviderId(source),
          authority: source.authority || 'unknown',
          status: source.status || 'unknown',
          routeCount: Number(source.routeCount || source.route_count || 0),
          publicRecommendationCount: Number(source.publicRecommendationCount || source.public_recommendation_count || 0),
          curationOnlyCount: Number(source.curationOnlyCount || source.curation_only_count || 0),
          staleRouteCount: Number(source.staleRouteCount || source.stale_route_count || 0),
          activeClosureRouteCount: Number(source.activeClosureRouteCount || source.active_closure_route_count || 0),
          lastCheckedAt: source.lastCheckedAt || source.last_checked_at || null,
          lastVerifiedAt: source.lastVerifiedAt || source.last_verified_at || null,
          oldestVerifiedAt: source.oldestVerifiedAt || source.oldest_verified_at || null,
          latestSyncStatus: latestIngestRun.status || null,
          latestSyncFinishedAt: readLatestSyncAt(latestIngestRun),
          latestSyncError: latestIngestRun.errorMessage || latestIngestRun.error_message || null,
        };
      }).sort((left, right) => {
        const routeDelta = Number(right.routeCount || 0) - Number(left.routeCount || 0);
        if (routeDelta !== 0) return routeDelta;
        return String(left.providerId || '').localeCompare(String(right.providerId || ''));
      });

  const staleSources = Array.isArray(existing.staleSources)
    ? existing.staleSources
    : routeCountsBySource.filter((source) => Number(source.staleRouteCount || 0) > 0);
  const failedSyncAreas = Array.isArray(existing.failedSyncAreas)
    ? existing.failedSyncAreas
    : routeCountsBySource
        .filter((source) => failedSyncStatus(source.latestSyncStatus) || Boolean(source.latestSyncError))
        .map((source) => ({
          providerId: source.providerId,
          name: source.name,
          status: source.latestSyncStatus || 'failed',
          finishedAt: source.latestSyncFinishedAt,
          errorMessage: source.latestSyncError || '',
        }));
  const verificationRequiredSources = routeCountsBySource.filter((source) => Number(source.routeCount || 0) > 0);
  const lastVerifiedValues = verificationRequiredSources.map((source) => source.lastVerifiedAt);

  return {
    postureTotals: {
      routeCount: Number(totals.routeCount || existing.postureTotals?.routeCount || 0),
      publicRecommendationCount: Number(
        totals.publicRecommendationCount || existing.postureTotals?.publicRecommendationCount || 0,
      ),
      curationOnlyCount: Number(totals.curationOnlyCount || existing.postureTotals?.curationOnlyCount || 0),
      needsReviewCount: Number(totals.needsReviewCount || existing.postureTotals?.needsReviewCount || 0),
      blockedRouteCount: Number(totals.blockedRouteCount || existing.postureTotals?.blockedRouteCount || 0),
    },
    lastVerified: {
      latestVerifiedAt: existing.lastVerified?.latestVerifiedAt || maxIsoTimestamp(lastVerifiedValues),
      oldestVerifiedAt: existing.lastVerified?.oldestVerifiedAt || minIsoTimestamp(lastVerifiedValues),
      sourceCountWithVerification: verificationRequiredSources.filter((source) => Boolean(source.lastVerifiedAt)).length,
      sourceCountMissingVerification: verificationRequiredSources.filter((source) => !source.lastVerifiedAt).length,
      sourceCountVerificationNotApplicable: routeCountsBySource.length - verificationRequiredSources.length,
    },
    routeCountsBySource,
    staleSources,
    failedSyncAreas,
  };
}

function buildOperatorHealth(summary) {
  const operatorReport = buildOperatorReport(summary);
  const postureTotals = readRecord(operatorReport.postureTotals);
  const staleSources = Array.isArray(operatorReport.staleSources) ? operatorReport.staleSources : [];
  const failedSyncAreas = Array.isArray(operatorReport.failedSyncAreas) ? operatorReport.failedSyncAreas : [];
  const lastVerified = readRecord(operatorReport.lastVerified);

  const failedSyncCount = failedSyncAreas.length;
  const staleSourceCount = staleSources.length;
  const missingVerificationCount = Number(lastVerified.sourceCountMissingVerification || 0);
  const publicRecommendationCount = Number(postureTotals.publicRecommendationCount || 0);
  const curationOnlyCount = Number(postureTotals.curationOnlyCount || 0);
  const routeCount = Number(postureTotals.routeCount || 0);
  const reasons = [];

  if (failedSyncCount > 0) reasons.push(`Failed latest sync areas: ${formatCount(failedSyncCount)}`);
  if (staleSourceCount > 0) reasons.push(`Stale sources: ${formatCount(staleSourceCount)}`);
  if (missingVerificationCount > 0) {
    reasons.push(`Sources missing verification timestamps: ${formatCount(missingVerificationCount)}`);
  }
  if (routeCount > 0 && publicRecommendationCount === 0 && curationOnlyCount > 0) {
    reasons.push(`No public recommendations in sampled report; curation-only routes: ${formatCount(curationOnlyCount)}`);
  }

  if (failedSyncCount > 0) return { status: 'critical', reasons };
  if (reasons.length > 0) return { status: 'watch', reasons };

  return {
    status: 'healthy',
    reasons: ['No stale sources, failed sync areas, or missing source verification timestamps detected.'],
  };
}

function buildWorkflowRunTriggerHealth(eventName, eventPayload) {
  if (eventName !== 'workflow_run') return { status: 'healthy', reasons: [] };
  const workflowRun = readRecord(readRecord(eventPayload).workflow_run);
  const conclusion = String(workflowRun.conclusion || '').toLowerCase();
  const name = workflowRun.name || workflowRun.workflow_name || 'unknown workflow';
  const url = workflowRun.html_url || workflowRun.url || '';

  if (conclusion === 'success') return { status: 'healthy', reasons: [] };

  const detail = url ? `${name} completed with ${conclusion || 'unknown'}: ${url}` : `${name} completed with ${conclusion || 'unknown'}`;
  return {
    status: 'critical',
    reasons: [`Trigger workflow ${detail}`],
  };
}

function formatOperatorReportMarkdown(summary) {
  const operatorReport = buildOperatorReport(summary);
  const operatorHealth = buildOperatorHealth(summary);
  const routeCountsBySource = Array.isArray(operatorReport.routeCountsBySource)
    ? operatorReport.routeCountsBySource
    : [];
  const staleSources = Array.isArray(operatorReport.staleSources) ? operatorReport.staleSources : [];
  const failedSyncAreas = Array.isArray(operatorReport.failedSyncAreas) ? operatorReport.failedSyncAreas : [];
  const postureTotals = readRecord(operatorReport.postureTotals);
  const lastVerified = readRecord(operatorReport.lastVerified);

  const routeRows = routeCountsBySource.length > 0
    ? routeCountsBySource.map((source) => [
        source.providerId || 'unknown',
        source.name || source.providerId || 'unknown',
        source.authority || 'unknown',
        formatCount(source.routeCount),
        formatCount(source.publicRecommendationCount),
        formatCount(source.curationOnlyCount),
        formatCount(source.staleRouteCount),
        source.lastVerifiedAt || 'none',
        source.latestSyncStatus || 'unknown',
      ])
    : [['none', 'none', 'none', '0', '0', '0', '0', 'none', 'none']];

  const staleRows = staleSources.length > 0
    ? staleSources.map((source) => [
        source.providerId || 'unknown',
        source.name || source.providerId || 'unknown',
        formatCount(source.staleRouteCount),
        source.lastCheckedAt || 'none',
        source.lastVerifiedAt || 'none',
      ])
    : [['none', 'none', '0', 'none', 'none']];

  const failedRows = failedSyncAreas.length > 0
    ? failedSyncAreas.map((source) => [
        source.providerId || 'unknown',
        source.status || 'failed',
        source.finishedAt || 'none',
        source.errorMessage || '',
      ])
    : [['none', 'none', 'none', '']];

  return [
    '### Operator Report',
    '',
    `Operator health: ${operatorHealth.status}`,
    ...operatorHealth.reasons.map((reason) => `- ${reason}`),
    '',
    `Public recommendations: ${formatCount(postureTotals.publicRecommendationCount)}`,
    `Curation only: ${formatCount(postureTotals.curationOnlyCount)}`,
    `Needs review: ${formatCount(postureTotals.needsReviewCount)}`,
    `Blocked: ${formatCount(postureTotals.blockedRouteCount)}`,
    `Latest verified: ${lastVerified.latestVerifiedAt || 'none'}`,
    `Oldest verified: ${lastVerified.oldestVerifiedAt || 'none'}`,
    `Sources with verification timestamps: ${formatCount(lastVerified.sourceCountWithVerification)}`,
    `Sources missing verification timestamps: ${formatCount(lastVerified.sourceCountMissingVerification)}`,
    `Sources not requiring route verification timestamps: ${formatCount(lastVerified.sourceCountVerificationNotApplicable)}`,
    '',
    '### Route counts by source',
    '',
    '| Source | Name | Authority | Routes | Public | Curation only | Stale | Last verified | Latest sync |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...routeRows.map((row) => `| ${row.join(' | ')} |`),
    '',
    '### Stale sources',
    '',
    '| Source | Name | Stale routes | Last checked | Last verified |',
    '| --- | --- | ---: | --- | --- |',
    ...staleRows.map((row) => `| ${row.join(' | ')} |`),
    '',
    '### Failed sync areas',
    '',
    '| Source | Status | Finished | Error |',
    '| --- | --- | --- | --- |',
    ...failedRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function jsonObjectCandidateAt(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }

  return null;
}

function extractJsonPayloadFromOutput(raw, label = 'route catalog output') {
  const text = String(raw || '');
  let lastError = null;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '{') continue;
    const candidate = jsonObjectCandidateAt(text, index);
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  if (!text.includes('{')) throw new Error(`${label} did not contain JSON`);
  const detail = lastError && lastError.message ? `: ${lastError.message}` : '';
  throw new Error(`${label} contained malformed JSON${detail}`);
}

function formatStatusCountsMarkdown(title, counts) {
  const entries = Object.entries(counts && typeof counts === 'object' ? counts : {})
    .map(([status, count]) => [status, Number(count || 0)])
    .filter(([status]) => status)
    .sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return [`### ${title}`, '', 'none'].join('\n');
  }

  return [
    `### ${title}`,
    '',
    '| Status | Count |',
    '| --- | ---: |',
    ...entries.map(([status, count]) => `| ${status} | ${formatCount(count)} |`),
  ].join('\n');
}

function formatSummaryMarkdown(summary) {
  const totals = summary && typeof summary.totals === 'object' ? summary.totals : {};
  const sourceSummaries = Array.isArray(summary && summary.sourceSummaries) ? summary.sourceSummaries : [];
  const generatedAt = summary && summary.generatedAt ? summary.generatedAt : new Date().toISOString();

  return [
    '## Route Catalog Summary Report',
    '',
    `Generated: ${generatedAt}`,
    '',
    '| Metric | Count |',
    '| --- | ---: |',
    `| Total routes | ${formatCount(totals.routeCount)} |`,
    `| Public recommendations | ${formatCount(totals.publicRecommendationCount)} |`,
    `| Curation only | ${formatCount(totals.curationOnlyCount)} |`,
    `| Stale routes | ${formatCount(totals.staleRouteCount)} |`,
    `| Active closure affected | ${formatCount(totals.activeClosureRouteCount)} |`,
    `| Raw source features | ${formatCount(totals.rawFeatureCount)} |`,
    '',
    '| Source | Authority | Routes | Public recommendations | Curation only | Stale | Closures | Raw features | Latest ingest |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...sourceSummaries.map((source) => [
      source.providerId || source.provider_id || 'unknown',
      source.authority || 'unknown',
      formatCount(source.routeCount),
      formatCount(source.publicRecommendationCount),
      formatCount(source.curationOnlyCount),
      formatCount(source.staleRouteCount),
      formatCount(source.activeClosureRouteCount),
      formatCount(source.rawFeatureCount),
      formatLatestIngest(source.latestIngestRun),
    ].join(' | ')).map((row) => `| ${row} |`),
    '',
    formatOperatorReportMarkdown(summary),
  ].join('\n');
}

function formatWorkflowSummaryMarkdown(summary) {
  const totals = summary && typeof summary.totals === 'object' ? summary.totals : {};
  const sourceSummaries = Array.isArray(summary && summary.sourceSummaries) ? summary.sourceSummaries : [];
  const limits = summary && typeof summary.limits === 'object' ? summary.limits : {};
  const truncated = summary && typeof summary.truncated === 'object' ? summary.truncated : {};

  if (summary && summary.ok === false) {
    return [
      '## Route Catalog Summary Report',
      '',
      'Status: failed',
      `Error: ${summary.error || 'Unknown route catalog summary error'}`,
      `Endpoint: ${summary.endpoint || 'unknown'}`,
      `Timeout: ${formatCount(summary.timeoutMs)} ms`,
      `Report limits: routes ${formatCount(limits.maxRouteRows)}; route-source links ${formatCount(limits.maxLinkRows)}; ingest runs ${formatCount(limits.maxIngestRunRows)}`,
      '',
      'The live route catalog summary endpoint did not return a usable report. No seed or mock routes are shown as verified.',
    ].join('\n');
  }

  return [
    formatSummaryMarkdown(summary),
    '',
    `Sources: ${sourceSummaries.length}`,
    `Report limits: routes ${formatCount(limits.maxRouteRows)}; route-source links ${formatCount(limits.maxLinkRows)}; ingest runs ${formatCount(limits.maxIngestRunRows)}`,
    `Truncated: verified routes ${formatBoolean(truncated.verifiedRoutes)}; route-source links ${formatBoolean(truncated.verifiedRouteSources)}; ingest runs ${formatBoolean(truncated.ingestRuns)}`,
    `Public recommendation count: ${formatCount(totals.publicRecommendationCount)}`,
    `Curation only count: ${formatCount(totals.curationOnlyCount)}`,
    `Stale route count: ${formatCount(totals.staleRouteCount)}`,
    `Active closure affected count: ${formatCount(totals.activeClosureRouteCount)}`,
    '',
    formatStatusCountsMarkdown('Recommendation statuses', summary && summary.recommendationStatusCounts),
    '',
    formatStatusCountsMarkdown('Verification statuses', summary && summary.verificationStatusCounts),
    '',
    formatStatusCountsMarkdown('Review statuses', summary && summary.reviewStatusCounts),
  ].join('\n');
}

async function fetchSummary(options, env) {
  const supabaseUrl = resolveSupabaseUrl(env);
  if (!supabaseUrl) throw new Error('Missing ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');

  const response = await fetch(routeCatalogSummaryUrl(supabaseUrl), {
    method: 'POST',
    headers: headersForSummary(resolveAnonKey(env)),
    body: JSON.stringify(buildRequestBody(options)),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`route-catalog-summary returned non-JSON response: ${text.slice(0, 300)}`);
  }
  if (!response.ok || body.ok === false) {
    throw new Error(`route-catalog-summary failed (${response.status}): ${body.error || response.statusText}`);
  }
  return body;
}

async function main() {
  loadRouteCatalogEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.dryRun) {
    const summary = {
      mode: 'dry-run',
      endpoint: resolveSupabaseUrl(process.env) ? routeCatalogSummaryUrl(resolveSupabaseUrl(process.env)) : '(missing)',
      supabaseUrl: resolveSupabaseUrl(process.env) ? '(present)' : '(missing)',
      anonKey: resolveAnonKey(process.env) ? '(present)' : '(missing)',
      requestBody: buildRequestBody(options),
    };
    console.log(options.json ? JSON.stringify(summary, null, 2) : inspect(summary, { depth: null, colors: false }));
    return;
  }

  try {
    const summary = await fetchSummary(options, process.env);
    console.log(options.json ? JSON.stringify(summary, null, 2) : formatSummaryMarkdown(summary));
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify(failurePayloadForSummary(error, options, process.env), null, 2));
    } else {
      console.error(error && error.message ? error.message : error);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  buildOperatorHealth,
  buildRequestBody,
  buildOperatorReport,
  buildWorkflowRunTriggerHealth,
  extractJsonPayloadFromOutput,
  failurePayloadForSummary,
  formatSummaryMarkdown,
  formatWorkflowSummaryMarkdown,
  parseArgs,
  resolveAnonKey,
  resolveSupabaseUrl,
  routeCatalogSummaryUrl,
};

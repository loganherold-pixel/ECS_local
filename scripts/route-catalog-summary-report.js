#!/usr/bin/env node
const { inspect } = require('util');
const { loadRouteCatalogEnv } = require('./route-catalog-env.js');

const DEFAULT_MAX_ROUTE_ROWS = 1000;
const DEFAULT_MAX_LINK_ROWS = 5000;
const DEFAULT_MAX_INGEST_RUN_ROWS = 500;

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
  ].join('\n');
}

function formatWorkflowSummaryMarkdown(summary) {
  const totals = summary && typeof summary.totals === 'object' ? summary.totals : {};
  const sourceSummaries = Array.isArray(summary && summary.sourceSummaries) ? summary.sourceSummaries : [];
  const limits = summary && typeof summary.limits === 'object' ? summary.limits : {};
  const truncated = summary && typeof summary.truncated === 'object' ? summary.truncated : {};

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

  const summary = await fetchSummary(options, process.env);
  console.log(options.json ? JSON.stringify(summary, null, 2) : formatSummaryMarkdown(summary));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  buildRequestBody,
  extractJsonPayloadFromOutput,
  formatSummaryMarkdown,
  formatWorkflowSummaryMarkdown,
  parseArgs,
  resolveAnonKey,
  resolveSupabaseUrl,
  routeCatalogSummaryUrl,
};

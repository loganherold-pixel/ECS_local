#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadRouteCatalogEnv } = require('./route-catalog-env.js');

const {
  buildRouteCatalogSyncInvocationPlan,
} = require(path.join(__dirname, 'route-catalog-sync-inventory.js'));

function redactSecret(value) {
  if (!value) return '(missing)';
  const text = String(value);
  if (text.length <= 8) return '[redacted]';
  return `${text.slice(0, 4)}...[redacted]`;
}

function parseArgs(argv) {
  const options = {
    adapters: [],
    allDirect: false,
    dryRun: false,
    payloadPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--all-direct') {
      options.allDirect = true;
    } else if (arg === '--adapter') {
      const value = argv[index + 1];
      if (!value) throw new Error('--adapter requires a route catalog sync inventory key');
      options.adapters.push(value);
      index += 1;
    } else if (arg === '--payload') {
      const value = argv[index + 1];
      if (!value) throw new Error('--payload requires a JSON file path');
      options.payloadPath = value;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/route-catalog-sync-invoke.js --dry-run --all-direct',
    '  node scripts/route-catalog-sync-invoke.js --dry-run --adapter usfs_mvum',
    '  node scripts/route-catalog-sync-invoke.js --adapter michigan_dnr_orv_gpx',
    '',
    'Required for real invocation:',
    '  ECS_SUPABASE_URL',
    '  ECS_ROUTE_CATALOG_SYNC_TOKEN',
  ].join('\n');
}

function selectPlan(fullPlan, options) {
  let selected = fullPlan;
  if (options.allDirect) {
    selected = selected.filter((entry) => entry.invocationMode === 'direct_edge_function');
  }
  if (options.adapters.length > 0) {
    const requested = new Set(options.adapters);
    selected = selected.filter((entry) => requested.has(entry.key));
    const found = new Set(selected.map((entry) => entry.key));
    const missing = [...requested].filter((key) => !found.has(key));
    if (missing.length > 0) throw new Error(`Unknown route catalog sync adapter(s): ${missing.join(', ')}`);
  }
  if (selected.length === 0) throw new Error('No route catalog sync adapters selected');
  return selected;
}

function readPayloadOverride(payloadPath) {
  if (!payloadPath) return null;
  const resolved = path.resolve(process.cwd(), payloadPath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

function invocationUrl(baseUrl, functionName) {
  return `${String(baseUrl).replace(/\/+$/, '')}/functions/v1/${functionName}`;
}

function resolveSyncSupabaseUrl(env) {
  return env.ECS_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '';
}

function summarizeDryRun(selected, env) {
  return {
    mode: 'dry-run',
    supabaseUrl: resolveSyncSupabaseUrl(env) ? '(present)' : '(missing)',
    syncToken: redactSecret(env.ECS_ROUTE_CATALOG_SYNC_TOKEN),
    adapters: selected.map((entry) => ({
      key: entry.key,
      providerId: entry.providerId,
      functionName: entry.functionName,
      invocationMode: entry.invocationMode,
      publicRecommendationPolicy: entry.publicRecommendationPolicy,
      expectedMaxPublicRecommendationCount: entry.expectedMaxPublicRecommendationCount,
      defaultPayload: entry.defaultPayload,
      workflowPath: entry.workflowPath,
      preprocessReason: entry.preprocessReason || undefined,
      safetyNotes: entry.safetyNotes,
    })),
  };
}

async function invokeEntry(entry, env, payloadOverride) {
  if (entry.invocationMode !== 'direct_edge_function') {
    throw new Error(`${entry.key} cannot be invoked directly: ${entry.preprocessReason}`);
  }

  const supabaseUrl = resolveSyncSupabaseUrl(env);
  const syncToken = env.ECS_ROUTE_CATALOG_SYNC_TOKEN;
  if (!supabaseUrl) throw new Error('Missing ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
  if (!syncToken) throw new Error('Missing ECS_ROUTE_CATALOG_SYNC_TOKEN');

  const payload = payloadOverride || entry.defaultPayload;
  const response = await fetch(invocationUrl(supabaseUrl, entry.functionName), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ecs-sync-token': syncToken,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`${entry.key} returned non-JSON response: ${text.slice(0, 300)}`);
  }

  if (!response.ok || body.ok === false) {
    throw new Error(`${entry.key} sync failed: ${body.error || response.statusText}`);
  }

  const publicRecommendationCount = Number(body.publicRecommendationCount || 0);
  if (publicRecommendationCount > entry.expectedMaxPublicRecommendationCount) {
    throw new Error(
      `${entry.key} created ${publicRecommendationCount} public recommendations; expected at most ${entry.expectedMaxPublicRecommendationCount}`,
    );
  }

  return {
    key: entry.key,
    source: body.source,
    rawFeatureCount: body.rawFeatureCount,
    normalizedFeatureCount: body.normalizedFeatureCount,
    publicRecommendationCount,
    caveat: body.caveat,
  };
}

async function main() {
  loadRouteCatalogEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.allDirect && options.adapters.length === 0) {
    throw new Error(`${usage()}\n\nSelect --all-direct or at least one --adapter.`);
  }

  const plan = buildRouteCatalogSyncInvocationPlan();
  const selected = selectPlan(plan, options);
  const payloadOverride = readPayloadOverride(options.payloadPath);

  if (options.dryRun) {
    console.log(JSON.stringify(summarizeDryRun(selected, process.env), null, 2));
    return;
  }

  const results = [];
  for (const entry of selected) {
    results.push(await invokeEntry(entry, process.env, payloadOverride));
  }
  console.log(JSON.stringify({ mode: 'invoke', results }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

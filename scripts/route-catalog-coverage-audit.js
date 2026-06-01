#!/usr/bin/env node
const { inspect } = require('util');
const { loadRouteCatalogEnv } = require('./route-catalog-env.js');

const ROUTE_CATALOG_COVERAGE_PROBES = [
  {
    key: 'tahoe_national_forest',
    label: 'Tahoe National Forest verified MVUM pilot',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 39.25,
    longitude: -120.55,
    radiusMiles: 85,
  },
  {
    key: 'mendocino_national_forest',
    label: 'Mendocino National Forest verified MVUM pilot',
    sourceAdapter: 'usfs_mvum',
    expectedPosture: 'verified_public_recommendations',
    latitude: 39.6,
    longitude: -122.8,
    radiusMiles: 85,
  },
  {
    key: 'michigan_dnr_orv_pilot',
    label: 'Michigan DNR ORV curation pilot',
    sourceAdapter: 'michigan_dnr_orv_gpx',
    expectedPosture: 'source_backed_curation_only',
    latitude: 44.98,
    longitude: -84.13,
    radiusMiles: 100,
  },
  {
    key: 'minnesota_dnr_ohv_pilot',
    label: 'Minnesota DNR OHV curation pilot',
    sourceAdapter: 'minnesota_dnr_ohv_trails',
    expectedPosture: 'source_backed_curation_only',
    latitude: 47.49,
    longitude: -92.46,
    radiusMiles: 100,
  },
  {
    key: 'oregon_odf_ohv_pilot',
    label: 'Oregon ODF Tillamook OHV curation pilot',
    sourceAdapter: 'oregon_odf_ohv_gpx',
    expectedPosture: 'source_backed_curation_only',
    latitude: 45.55,
    longitude: -123.55,
    radiusMiles: 90,
  },
  {
    key: 'blm_ca_nv_pilot',
    label: 'BLM GTLF CA/NV curation pilot',
    sourceAdapter: 'blm_gtlf',
    expectedPosture: 'source_backed_curation_only',
    latitude: 36.45,
    longitude: -116.85,
    radiusMiles: 120,
  },
  {
    key: 'usgs_nps_sierra_context',
    label: 'USGS/NPS Sierra supplemental context pilot',
    sourceAdapter: 'usgs_digital_trails,nps_public_trails',
    expectedPosture: 'supplemental_context_only',
    latitude: 37.75,
    longitude: -119.6,
    radiusMiles: 60,
  },
  {
    key: 'conus_empty_control',
    label: 'CONUS empty-state control',
    sourceAdapter: 'none',
    expectedPosture: 'no_verified_routes_expected',
    latitude: 38.5,
    longitude: -98.0,
    radiusMiles: 35,
  },
];

function routeCatalogSearchUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/functions/v1/route-catalog-search`;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    all: false,
    probeKeys: [],
    json: false,
    failOnMismatch: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--fail-on-mismatch') {
      options.failOnMismatch = true;
    } else if (arg === '--probe') {
      const value = argv[index + 1];
      if (!value) throw new Error('--probe requires a coverage probe key');
      options.probeKeys.push(value);
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
    '  node scripts/route-catalog-coverage-audit.js --dry-run --all',
    '  node scripts/route-catalog-coverage-audit.js --dry-run --probe tahoe_national_forest',
    '  node scripts/route-catalog-coverage-audit.js --all',
    '  node scripts/route-catalog-coverage-audit.js --all --fail-on-mismatch',
    '',
    'Required for live audit:',
    '  ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL',
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY is optional for route-catalog-search, but sent when present.',
  ].join('\n');
}

function buildRouteCatalogCoverageAuditPlan({ probeKeys = [] } = {}) {
  const requested = new Set(probeKeys);
  const probes = probeKeys.length > 0
    ? ROUTE_CATALOG_COVERAGE_PROBES.filter((probe) => requested.has(probe.key))
    : [...ROUTE_CATALOG_COVERAGE_PROBES];

  if (probeKeys.length > 0) {
    const found = new Set(probes.map((probe) => probe.key));
    const missing = probeKeys.filter((key) => !found.has(key));
    if (missing.length > 0) throw new Error(`Unknown route catalog coverage probe(s): ${missing.join(', ')}`);
  }

  return probes.map((probe) => ({
    ...probe,
    requestBody: {
      latitude: probe.latitude,
      longitude: probe.longitude,
      radiusMiles: probe.radiusMiles,
      limit: 10,
      includeGeometry: false,
      includePreviewGeometry: false,
    },
  }));
}

function resolveSupabaseUrl(env) {
  return env.ECS_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '';
}

function resolveAnonKey(env) {
  return env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
}

function headersForAudit(anonKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (anonKey) {
    headers.apikey = anonKey;
    headers.authorization = `Bearer ${anonKey}`;
  }
  return headers;
}

function summarizeSearchResponse(probe, body) {
  const meta = body && typeof body.meta === 'object' ? body.meta : {};
  const coverageState = body && typeof body.coverageState === 'object' ? body.coverageState : {};
  const records = Array.isArray(body.records) ? body.records : [];
  const count = Number(body.count || records.length || 0);
  const radiusMatchedCount = Number(meta.radiusMatchedCount || 0);
  const curationCandidateCount = Number(meta.curationCandidateCount || 0);
  const anySourceBackedCandidateCount = Number(meta.anySourceBackedCandidateCount || 0);
  const observedPosture = count > 0 && coverageState.state === 'ready'
    ? 'verified_public_recommendations'
    : curationCandidateCount > 0 || (count === 0 && anySourceBackedCandidateCount > 0)
      ? 'source_backed_curation_only'
      : 'no_verified_routes_expected';
  const matchesExpectedPosture =
    probe.expectedPosture === observedPosture ||
    (probe.expectedPosture === 'supplemental_context_only' && observedPosture === 'source_backed_curation_only');
  return {
    key: probe.key,
    label: probe.label,
    sourceAdapter: probe.sourceAdapter,
    expectedPosture: probe.expectedPosture,
    observedPosture,
    matchesExpectedPosture,
    count,
    coverageState: coverageState.state || 'unknown',
    coverageTitle: coverageState.title || '',
    radiusMatchedCount,
    curationCandidateCount,
    anySourceBackedCandidateCount,
    sampleRoutes: records.slice(0, 3).map((record) => ({
      publicId: record.public_id || record.publicId || '',
      name: record.name || record.title || '',
      confidenceScore: record.confidence_score || record.confidenceScore || null,
      sourceConfidenceLabel: record.source_confidence_label || record.sourceConfidenceLabel || '',
    })),
  };
}

async function auditProbe(probe, env) {
  const supabaseUrl = resolveSupabaseUrl(env);
  if (!supabaseUrl) throw new Error('Missing ECS_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');

  const response = await fetch(routeCatalogSearchUrl(supabaseUrl), {
    method: 'POST',
    headers: headersForAudit(resolveAnonKey(env)),
    body: JSON.stringify(probe.requestBody),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`${probe.key} returned non-JSON response: ${text.slice(0, 300)}`);
  }
  if (!response.ok || body.ok === false) {
    throw new Error(`${probe.key} coverage audit failed: ${body.error || response.statusText}`);
  }
  return summarizeSearchResponse(probe, body);
}

function printHumanAudit(result) {
  console.log(`${result.label}`);
  console.log(`  state: ${result.coverageState}`);
  console.log(`  observed posture: ${result.observedPosture}`);
  console.log(`  matches expected: ${result.matchesExpectedPosture ? 'yes' : 'no'}`);
  console.log(`  count: ${result.count}`);
  console.log(`  radius matches: ${result.radiusMatchedCount}`);
  console.log(`  curation candidates: ${result.curationCandidateCount}`);
  console.log(`  source-backed candidates: ${result.anySourceBackedCandidateCount}`);
}

async function main() {
  loadRouteCatalogEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.all && options.probeKeys.length === 0) {
    throw new Error(`${usage()}\n\nSelect --all or at least one --probe.`);
  }

  const plan = buildRouteCatalogCoverageAuditPlan({ probeKeys: options.all ? [] : options.probeKeys });
  if (options.dryRun) {
    const summary = {
      mode: 'dry-run',
      supabaseUrl: resolveSupabaseUrl(process.env) ? '(present)' : '(missing)',
      anonKey: resolveAnonKey(process.env) ? '(present)' : '(missing)',
      probes: plan,
    };
    console.log(options.json ? JSON.stringify(summary, null, 2) : inspect(summary, { depth: null, colors: false }));
    return;
  }

  const results = [];
  for (const probe of plan) {
    const result = await auditProbe(probe, process.env);
    results.push(result);
    if (!options.json) printHumanAudit(result);
  }
  const mismatchedProbes = results.filter((result) => !result.matchesExpectedPosture);
  if (options.json) console.log(JSON.stringify({ mode: 'live-audit', results }, null, 2));
  if (options.failOnMismatch && mismatchedProbes.length > 0) {
    console.error(
      `Route catalog coverage audit found ${mismatchedProbes.length} mismatched probe(s): ${
        mismatchedProbes.map((result) => result.key).join(', ')
      }`,
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  ROUTE_CATALOG_COVERAGE_PROBES,
  auditProbe,
  buildRouteCatalogCoverageAuditPlan,
  routeCatalogSearchUrl,
  summarizeSearchResponse,
};

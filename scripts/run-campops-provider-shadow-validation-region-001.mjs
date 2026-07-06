import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import {
  REGION_001_COHORT,
  REGION_001_LABEL,
  buildCampOpsProviderShadowEvidence,
} from './lib/campops-provider-shadow-validation.mjs';

const DEFAULT_OUTPUT = path.join('.smoke', 'campops-provider-shadow-region-001-evidence.json');
const REGION_001_BBOX = {
  minLng: -120.5,
  minLat: 38.0,
  maxLng: -114.0,
  maxLat: 42.1,
};
const PAGE_SIZE = 1000;
const MAX_ROUTE_ROWS = 12_000;
const MAX_CAMPGROUND_ROWS = 5_000;
const ROUTE_SOURCE_CHUNK_SIZE = 75;
const CAMPGROUND_RELATED_CHUNK_SIZE = 250;

function parseArgs(args) {
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  return {
    jsonOnly: args.includes('--json'),
    dryRun: args.includes('--dry-run'),
    aggregateJson: valueAfter('--aggregate-json'),
    output: valueAfter('--output') ?? DEFAULT_OUTPUT,
    regionLabel: valueAfter('--region-label') ?? REGION_001_LABEL,
    cohortLabel: valueAfter('--cohort-label') ?? REGION_001_COHORT,
  };
}

function loadDotEnv(root) {
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index <= 0) continue;
      const key = trimmed.slice(0, index).trim();
      if (process.env[key] != null) continue;
      const rawValue = trimmed.slice(index + 1).trim();
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}

function envValue(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) return { key, value: value.trim() };
  }
  return null;
}

function projectRefFromUrl(url) {
  const match = String(url ?? '').match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

function safeError(error) {
  const message = typeof error?.message === 'string' ? error.message : 'Supabase query failed.';
  const code = typeof error?.code === 'string' ? error.code : null;
  return {
    code,
    message: message
      .replace(/eyJ[a-zA-Z0-9._-]+/g, '[redacted-token]')
      .replace(/https:\/\/[a-z0-9-]+\.supabase\.co/gi, '[redacted-supabase-url]'),
  };
}

function inRegion(query, latColumn, lngColumn) {
  return query
    .gte(lngColumn, REGION_001_BBOX.minLng)
    .lte(lngColumn, REGION_001_BBOX.maxLng)
    .gte(latColumn, REGION_001_BBOX.minLat)
    .lte(latColumn, REGION_001_BBOX.maxLat);
}

async function readAll({ client, table, select, apply, pageSize = PAGE_SIZE, maxRows = PAGE_SIZE }) {
  const rows = [];
  let exactCount = null;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    let query = client.from(table).select(select, { count: offset === 0 ? 'exact' : undefined });
    if (apply) query = apply(query);
    query = query.range(offset, Math.min(offset + pageSize - 1, maxRows - 1));
    const { data, error, count } = await query;
    if (error) throw error;
    if (typeof count === 'number') exactCount = count;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
    if (typeof exactCount === 'number' && rows.length >= exactCount) break;
  }
  return {
    rows,
    count: exactCount ?? rows.length,
    truncated: typeof exactCount === 'number' ? rows.length < exactCount : rows.length >= maxRows,
  };
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function maxIso(values) {
  const dates = values.map(dateValue).filter(Boolean);
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

function minIso(values) {
  const dates = values.map(dateValue).filter(Boolean);
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((date) => date.getTime()))).toISOString();
}

function numberValue(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function routeRollup(rows, now) {
  return {
    candidate_count: rows.length,
    legal_access_covered_count: rows.filter((row) => numberValue(row.official_access_coverage_pct) > 0).length,
    legal_access_unknown_count: rows.filter((row) => numberValue(row.unknown_access_coverage_pct, 100) >= 50).length,
    legal_access_conflict_count: rows.filter((row) => numberValue(row.restricted_access_coverage_pct) > 0).length,
    closure_covered_count: rows.filter((row) =>
      numberValue(row.active_closure_count) > 0 || numberValue(row.seasonal_restriction_count) > 0,
    ).length,
    active_closure_candidate_count: rows.filter((row) => numberValue(row.active_closure_count) > 0).length,
    seasonal_restriction_candidate_count: rows.filter((row) => numberValue(row.seasonal_restriction_count) > 0).length,
    stale_candidate_count: rows.filter((row) => {
      const staleAt = dateValue(row.stale_at);
      return staleAt ? staleAt.getTime() <= now.getTime() : false;
    }).length,
    latest_verified_at: maxIso(rows.map((row) => row.last_verified_at)),
    oldest_verified_at: minIso(rows.map((row) => row.last_verified_at)),
  };
}

function groupRouteSources(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const source = Array.isArray(row.route_sources) ? row.route_sources[0] : row.route_sources;
    const providerId = source?.provider_id;
    if (!providerId) continue;
    const key = `${providerId}|${source.source_type ?? ''}|${source.authority ?? ''}|${source.status ?? ''}`;
    const current = grouped.get(key) ?? {
      provider_id: providerId,
      source_type: source.source_type ?? null,
      authority: source.authority ?? null,
      status: source.status ?? null,
      covered_routes: new Set(),
      coverageValues: [],
      conflicting_source_rows: 0,
      verifiedDates: [],
    };
    current.covered_routes.add(row.verified_route_id);
    current.coverageValues.push(numberValue(row.coverage_pct));
    if (row.source_role === 'conflicting') current.conflicting_source_rows += 1;
    current.verifiedDates.push(row.last_verified_at);
    grouped.set(key, current);
  }
  return Array.from(grouped.values())
    .map((item) => ({
      provider_id: item.provider_id,
      source_type: item.source_type,
      authority: item.authority,
      status: item.status,
      covered_routes: item.covered_routes.size,
      avg_source_coverage_pct: item.coverageValues.length
        ? Math.round((item.coverageValues.reduce((sum, value) => sum + value, 0) / item.coverageValues.length) * 100) / 100
        : 0,
      conflicting_source_rows: item.conflicting_source_rows,
      latest_source_verified_at: maxIso(item.verifiedDates),
    }))
    .sort((a, b) => b.covered_routes - a.covered_routes || a.provider_id.localeCompare(b.provider_id))
    .slice(0, 20);
}

function campgroundRollup(rows, now) {
  return {
    candidate_count: rows.length,
    provider_backed_count: rows.filter((row) => row.primary_provider).length,
    status_known_count: rows.filter((row) => ['open', 'seasonal', 'temporarily_closed', 'closed', 'verify'].includes(row.status)).length,
    unknown_status_count: rows.filter((row) => ['unknown', 'verify', null, undefined].includes(row.status)).length,
    closed_status_count: rows.filter((row) => ['closed', 'temporarily_closed'].includes(row.status)).length,
    stale_canonical_count: rows.filter((row) => {
      const latest = dateValue(row.last_synced_at ?? row.last_verified_at ?? row.updated_at);
      return latest ? latest.getTime() < now.getTime() - 30 * 86_400_000 : true;
    }).length,
    latest_service_checked_at: maxIso(rows.map((row) =>
      row.last_availability_checked_at ?? row.last_verified_at ?? row.last_synced_at,
    )),
    oldest_service_checked_at: minIso(rows.map((row) =>
      row.last_availability_checked_at ?? row.last_verified_at ?? row.last_synced_at,
    )),
  };
}

function groupCampgroundsByProvider(rows, now) {
  const grouped = new Map();
  for (const row of rows) {
    const providerId = row.primary_provider || 'unknown';
    const current = grouped.get(providerId) ?? {
      provider_id: providerId,
      campground_count: 0,
      known_status_count: 0,
      stale_count: 0,
      checkedDates: [],
    };
    current.campground_count += 1;
    if (['open', 'seasonal', 'temporarily_closed', 'closed', 'verify'].includes(row.status)) current.known_status_count += 1;
    const latest = dateValue(row.last_synced_at ?? row.last_verified_at ?? row.updated_at);
    if (!latest || latest.getTime() < now.getTime() - 30 * 86_400_000) current.stale_count += 1;
    current.checkedDates.push(row.last_availability_checked_at ?? row.last_verified_at ?? row.last_synced_at);
    grouped.set(providerId, current);
  }
  return Array.from(grouped.values())
    .map((item) => ({
      provider_id: item.provider_id,
      campground_count: item.campground_count,
      known_status_count: item.known_status_count,
      stale_count: item.stale_count,
      latest_checked_at: maxIso(item.checkedDates),
    }))
    .sort((a, b) => b.campground_count - a.campground_count || a.provider_id.localeCompare(b.provider_id))
    .slice(0, 20);
}

function availabilityRollup(rows, now) {
  return {
    availability_row_count: rows.length,
    covered_campgrounds: new Set(rows.map((row) => row.campground_id)).size,
    unknown_or_stale_rows: rows.filter((row) => ['unknown', 'stale', null, undefined].includes(row.availability_status)).length,
    expired_rows: rows.filter((row) => {
      const expiresAt = dateValue(row.expires_at);
      return expiresAt ? expiresAt.getTime() <= now.getTime() : false;
    }).length,
    latest_availability_checked_at: maxIso(rows.map((row) => row.last_checked_at)),
    oldest_availability_checked_at: minIso(rows.map((row) => row.last_checked_at)),
  };
}

function groupSourceRecords(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const providerId = row.provider_id || 'unknown';
    const current = grouped.get(providerId) ?? {
      provider_id: providerId,
      source_record_count: 0,
      campgrounds: new Set(),
      lastSeenDates: [],
      firstSeenDates: [],
    };
    current.source_record_count += 1;
    if (row.campground_id) current.campgrounds.add(row.campground_id);
    current.lastSeenDates.push(row.last_seen_at);
    current.firstSeenDates.push(row.first_seen_at);
    grouped.set(providerId, current);
  }
  return Array.from(grouped.values())
    .map((item) => ({
      provider_id: item.provider_id,
      source_record_count: item.source_record_count,
      covered_campgrounds: item.campgrounds.size,
      latest_seen_at: maxIso(item.lastSeenDates),
      oldest_seen_at: minIso(item.firstSeenDates),
    }))
    .sort((a, b) => b.source_record_count - a.source_record_count || a.provider_id.localeCompare(b.provider_id))
    .slice(0, 20);
}

function syncRollup(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const providerId = row.provider_id || 'unknown';
    const current = grouped.get(providerId) ?? {
      provider_id: providerId,
      run_count: 0,
      completed_run_count: 0,
      failed_run_count: 0,
      finishedDates: [],
      records_read: 0,
      records_upserted: 0,
      records_failed: 0,
      error_count: 0,
    };
    current.run_count += 1;
    if (['succeeded', 'partial'].includes(row.status)) current.completed_run_count += 1;
    if (row.status === 'failed') current.failed_run_count += 1;
    current.finishedDates.push(row.finished_at);
    current.records_read += numberValue(row.records_read);
    current.records_upserted += numberValue(row.records_upserted);
    current.records_failed += numberValue(row.records_failed);
    current.error_count += numberValue(row.error_count);
    grouped.set(providerId, current);
  }
  return Array.from(grouped.values())
    .map((item) => ({
      provider_id: item.provider_id,
      run_count: item.run_count,
      completed_run_count: item.completed_run_count,
      failed_run_count: item.failed_run_count,
      latest_finished_at: maxIso(item.finishedDates),
      records_read: item.records_read,
      records_upserted: item.records_upserted,
      records_failed: item.records_failed,
      error_count: item.error_count,
    }))
    .sort((a, b) => a.provider_id.localeCompare(b.provider_id));
}

async function queryActiveSupabaseAggregate(client) {
  const now = new Date();
  const readLimitations = [];

  let routeRows = [];
  try {
    const result = await readAll({
      client,
      table: 'verified_routes',
      select: 'id, official_access_coverage_pct, unknown_access_coverage_pct, restricted_access_coverage_pct, active_closure_count, seasonal_restriction_count, last_verified_at, stale_at',
      apply: (query) => inRegion(query, 'center_latitude', 'center_longitude'),
      pageSize: PAGE_SIZE,
      maxRows: MAX_ROUTE_ROWS,
    });
    routeRows = result.rows;
    if (result.truncated) readLimitations.push({ source: 'verified_routes', reason: 'row_cap_reached', rowCap: MAX_ROUTE_ROWS });
  } catch (error) {
    readLimitations.push({ source: 'verified_routes', reason: 'read_failed', error: safeError(error) });
  }

  let routeSourceRows = [];
  if (routeRows.length > 0) {
    const routeIds = routeRows.map((row) => row.id).filter(Boolean);
    for (let index = 0; index < routeIds.length; index += ROUTE_SOURCE_CHUNK_SIZE) {
      const chunk = routeIds.slice(index, index + ROUTE_SOURCE_CHUNK_SIZE);
      try {
        const { data, error } = await client
          .from('verified_route_sources')
          .select('verified_route_id, source_role, coverage_pct, last_verified_at, route_sources(provider_id, source_type, authority, status)')
          .in('verified_route_id', chunk);
        if (error) throw error;
        routeSourceRows.push(...(Array.isArray(data) ? data : []));
      } catch (error) {
        readLimitations.push({ source: 'verified_route_sources', reason: 'read_failed', error: safeError(error) });
        break;
      }
    }
  }

  let campgroundRows = [];
  try {
    const result = await readAll({
      client,
      table: 'campgrounds',
      select: 'id, status, availability_status, primary_provider, last_synced_at, last_verified_at, last_availability_checked_at, updated_at',
      apply: (query) => inRegion(query.neq('status', 'removed'), 'latitude', 'longitude'),
      pageSize: PAGE_SIZE,
      maxRows: MAX_CAMPGROUND_ROWS,
    });
    campgroundRows = result.rows;
    if (result.truncated) readLimitations.push({ source: 'campgrounds', reason: 'row_cap_reached', rowCap: MAX_CAMPGROUND_ROWS });
  } catch (error) {
    readLimitations.push({ source: 'campgrounds', reason: 'read_failed', error: safeError(error) });
  }

  let availabilityRows = [];
  const campgroundIds = campgroundRows.map((row) => row.id).filter(Boolean);
  for (let index = 0; index < campgroundIds.length; index += CAMPGROUND_RELATED_CHUNK_SIZE) {
    const chunk = campgroundIds.slice(index, index + CAMPGROUND_RELATED_CHUNK_SIZE);
    try {
      const { data, error } = await client
        .from('campground_availability')
        .select('campground_id, provider_id, availability_status, last_checked_at, expires_at')
        .in('campground_id', chunk);
      if (error) throw error;
      availabilityRows.push(...(Array.isArray(data) ? data : []));
    } catch (error) {
      readLimitations.push({ source: 'campground_availability', reason: 'read_failed', error: safeError(error) });
      break;
    }
  }

  let sourceRows = [];
  if (campgroundIds.length > 0) {
    for (let index = 0; index < campgroundIds.length; index += CAMPGROUND_RELATED_CHUNK_SIZE) {
      const chunk = campgroundIds.slice(index, index + CAMPGROUND_RELATED_CHUNK_SIZE);
      try {
        const { data, error } = await client
          .from('campground_source_records')
          .select('campground_id, provider_id, first_seen_at, last_seen_at')
          .in('campground_id', chunk);
        if (error) throw error;
        sourceRows.push(...(Array.isArray(data) ? data : []));
      } catch (error) {
        readLimitations.push({ source: 'campground_source_records', reason: 'read_failed_or_rls_limited', error: safeError(error) });
        break;
      }
    }
  }

  let syncRows = [];
  try {
    const result = await readAll({
      client,
      table: 'campground_sync_runs',
      select: 'provider_id, started_at, finished_at, status, records_read, records_upserted, records_failed, error_count',
      pageSize: PAGE_SIZE,
      maxRows: 5000,
    });
    syncRows = result.rows;
  } catch (error) {
    readLimitations.push({ source: 'campground_sync_runs', reason: 'read_failed_or_rls_limited', error: safeError(error) });
  }

  return {
    checkedAt: now.toISOString(),
    routeRollup: routeRollup(routeRows, now),
    routeSources: groupRouteSources(routeSourceRows),
    campgroundRollup: campgroundRollup(campgroundRows, now),
    campgroundByProvider: groupCampgroundsByProvider(campgroundRows, now),
    availabilityRollup: availabilityRollup(availabilityRows, now),
    syncRollup: syncRollup(syncRows),
    sourceRecordRollup: groupSourceRecords(sourceRows),
    readLimitations,
  };
}

function readAggregateFile(root, relativeOrAbsolutePath) {
  const filePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(root, relativeOrAbsolutePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeEvidence(root, output, evidence) {
  const filePath = path.isAbsolute(output) ? output : path.join(root, output);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function runRegion001ProviderShadowValidationCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = parseArgs(options.args ?? process.argv.slice(2));
  const stdout = options.stdout ?? process.stdout;
  loadDotEnv(root);

  const generatedAt = new Date().toISOString();
  let aggregate;
  let projectRef = null;
  let credentialMode = 'aggregate-file';

  if (args.aggregateJson) {
    aggregate = readAggregateFile(root, args.aggregateJson);
  } else {
    const url = envValue('ECS_SUPABASE_URL', 'SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
    const key = envValue('ECS_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
    if (!url || !key) {
      aggregate = {
        checkedAt: generatedAt,
        routeRollup: {},
        routeSources: [],
        campgroundRollup: {},
        campgroundByProvider: [],
        availabilityRollup: {},
        syncRollup: [],
        sourceRecordRollup: [],
        readLimitations: [{ source: 'supabase_credentials', reason: 'missing_supabase_url_or_key' }],
      };
    } else {
      projectRef = projectRefFromUrl(url.value);
      credentialMode = /SERVICE_ROLE/i.test(key.key) ? 'service_role_server_side' : 'anon_rls_limited';
      const client = createClient(url.value, key.value, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { 'x-ecs-evidence-runner': 'campops-provider-shadow-region-001' } },
      });
      aggregate = await queryActiveSupabaseAggregate(client);
    }
  }

  const evidence = buildCampOpsProviderShadowEvidence({
    generatedAt,
    regionLabel: args.regionLabel,
    releaseCohortLabel: args.cohortLabel,
    projectRef: projectRef ?? aggregate.projectRef ?? null,
    sourceAggregate: {
      ...aggregate,
      readLimitations: [
        ...(Array.isArray(aggregate.readLimitations) ? aggregate.readLimitations : []),
        ...(credentialMode === 'anon_rls_limited' ? [{ source: 'supabase_credentials', reason: 'anon_key_used_admin_tables_may_be_rls_limited' }] : []),
      ],
    },
  });

  const outputPath = args.dryRun ? null : writeEvidence(root, args.output, evidence);
  if (args.jsonOnly) {
    stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } else {
    stdout.write(`CampOps Region 001 provider shadow evidence: ${evidence.summary.shadowValidatedCategories.length} shadow-validated category/categories, ${evidence.summary.missingOrBlockedCategories.length} missing or blocked.\n`);
    stdout.write(`Provider influence approved: no\n`);
    stdout.write(`Raw provider payloads captured: no\n`);
    stdout.write(`Precise private coordinates captured: no\n`);
    stdout.write(`Result file: ${outputPath ? path.relative(root, outputPath) : 'dry-run'}\n`);
    if (evidence.readLimitations.length > 0) {
      stdout.write('Read limitations:\n');
      for (const item of evidence.readLimitations) stdout.write(`- ${item.source}: ${item.reason}\n`);
    }
  }
  return evidence;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runRegion001ProviderShadowValidationCli().catch((error) => {
    console.error('CampOps provider shadow validation failed:', safeError(error).message);
    process.exitCode = 1;
  });
}

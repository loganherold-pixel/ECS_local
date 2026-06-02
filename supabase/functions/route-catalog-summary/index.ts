/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const PAGE_SIZE = 1000;
const LINK_ROUTE_ID_BATCH_SIZE = 100;

type JsonRecord = Record<string, unknown>;

type SourceRecord = {
  id: string;
  provider_id: string;
  name: string;
  source_type: string;
  authority: string;
  status: string;
  last_checked_at?: string | null;
  source_uri?: string | null;
  attribution?: string | null;
  license?: string | null;
  refresh_frequency?: string | null;
  updated_at?: string | null;
};

type RouteRecord = {
  id: string;
  recommendation_status?: string | null;
  verification_status?: string | null;
  review_status?: string | null;
  confidence_score?: number | string | null;
  active_closure_count?: number | string | null;
  stale_at?: string | null;
  updated_at?: string | null;
  last_verified_at?: string | null;
};

type RouteSourceLink = {
  verified_route_id: string;
  route_source_id: string;
  source_role?: string | null;
  coverage_pct?: number | string | null;
  last_verified_at?: string | null;
};

type IngestRun = {
  id: string;
  route_source_id: string;
  status?: string | null;
  source_uri?: string | null;
  source_version?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  raw_feature_count?: number | string | null;
  normalized_feature_count?: number | string | null;
  error_message?: string | null;
  metadata?: JsonRecord | null;
};

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getEnvAny(names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`Missing environment variable: ${names.join(' or ')}`);
}

function createAdminClient() {
  return createClient(
    getEnvAny(['ECS_SUPABASE_URL', 'SUPABASE_URL']),
    getEnvAny(['ECS_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function requestParams(req: Request): Promise<JsonRecord> {
  const url = new URL(req.url);
  const body = req.method === 'POST'
    ? ((await req.json().catch(() => ({}))) as JsonRecord)
    : {};
  url.searchParams.forEach((value, key) => {
    if (body[key] == null) body[key] = value;
  });
  return body;
}

function readBoundedInteger(value: unknown, fallback: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.min(maximum, Math.round(number)));
}

function readNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function countBy<T extends JsonRecord>(rows: T[], key: keyof T): Record<string, number> {
  return rows.reduce((counts, row) => {
    const value = typeof row[key] === 'string' && String(row[key]).trim() ? String(row[key]) : 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

function isPublicRecommendation(route: RouteRecord): boolean {
  return route.review_status === 'approved' && route.recommendation_status === 'recommendable';
}

function needsReview(route: RouteRecord): boolean {
  return route.recommendation_status === 'needs_review' ||
    route.review_status === 'draft' ||
    route.review_status === 'pending_review' ||
    route.review_status === 'needs_more_data';
}

function isBlocked(route: RouteRecord): boolean {
  return route.recommendation_status === 'not_recommended' ||
    route.review_status === 'rejected' ||
    readNumber(route.active_closure_count) > 0;
}

function isStale(route: RouteRecord, nowMs: number): boolean {
  if (!route.stale_at) return false;
  const staleMs = Date.parse(route.stale_at);
  return Number.isFinite(staleMs) && staleMs <= nowMs;
}

function dateMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestRunForSource(runs: IngestRun[]): IngestRun | null {
  return runs.reduce<IngestRun | null>((latest, run) => {
    if (!latest) return run;
    const latestMs = Math.max(dateMs(latest.finished_at), dateMs(latest.started_at));
    const runMs = Math.max(dateMs(run.finished_at), dateMs(run.started_at));
    return runMs > latestMs ? run : latest;
  }, null);
}

function serializeLatestIngestRun(run: IngestRun | null): JsonRecord | null {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status || 'unknown',
    startedAt: run.started_at || null,
    finishedAt: run.finished_at || null,
    sourceVersion: run.source_version || null,
    rawFeatureCount: readNumber(run.raw_feature_count),
    normalizedFeatureCount: readNumber(run.normalized_feature_count),
    errorMessage: run.error_message || null,
  };
}

async function fetchPagedRows<T>(
  admin: ReturnType<typeof createAdminClient>,
  tableName: string,
  selectColumns: string,
  maxRows: number,
  orderColumn?: string,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];

  for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
    const limit = Math.min(PAGE_SIZE, maxRows - offset);
    let query = admin.from(tableName).select(selectColumns).range(offset, offset + limit - 1);
    if (orderColumn) query = query.order(orderColumn, { ascending: false });
    const { data, error } = await query;
    if (error) throw new Error(`Unable to read ${tableName}: ${error.message}`);
    const page = (Array.isArray(data) ? data : []) as T[];
    rows.push(...page);
    if (page.length < limit) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}

async function fetchRouteSourceLinksForRoutes(
  admin: ReturnType<typeof createAdminClient>,
  routeIds: string[],
  maxRows: number,
): Promise<{ rows: RouteSourceLink[]; truncated: boolean }> {
  const uniqueRouteIds = Array.from(new Set(routeIds.filter((routeId) => !!routeId)));
  const rows: RouteSourceLink[] = [];

  for (let batchStart = 0; batchStart < uniqueRouteIds.length; batchStart += LINK_ROUTE_ID_BATCH_SIZE) {
    const batchRouteIds = uniqueRouteIds.slice(batchStart, batchStart + LINK_ROUTE_ID_BATCH_SIZE);

    for (let offset = 0; rows.length < maxRows; offset += PAGE_SIZE) {
      const limit = Math.min(PAGE_SIZE, maxRows - rows.length);
      const { data, error } = await admin
        .from('verified_route_sources')
        .select('verified_route_id,route_source_id,source_role,coverage_pct,last_verified_at')
        .in('verified_route_id', batchRouteIds)
        .order('verified_route_id', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(`Unable to read verified_route_sources: ${error.message}`);

      const page = (Array.isArray(data) ? data : []) as RouteSourceLink[];
      rows.push(...page);
      if (page.length < limit) break;
    }

    if (rows.length >= maxRows) return { rows, truncated: true };
  }

  return { rows, truncated: false };
}

async function countRawSourceFeatures(admin: ReturnType<typeof createAdminClient>): Promise<number | null> {
  const { count, error } = await admin
    .from('route_raw_source_features')
    .select('id', { count: 'exact', head: true });
  if (error) return null;
  return typeof count === 'number' ? count : null;
}

function buildSummary({
  sources,
  routes,
  links,
  ingestRuns,
  rawFeatureCount,
  truncated,
  limits,
}: {
  sources: SourceRecord[];
  routes: RouteRecord[];
  links: RouteSourceLink[];
  ingestRuns: IngestRun[];
  rawFeatureCount: number | null;
  truncated: JsonRecord;
  limits: JsonRecord;
}): JsonRecord {
  const generatedAt = new Date().toISOString();
  const nowMs = Date.now();
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const ingestRunsBySourceId = new Map<string, IngestRun[]>();
  const sourceRouteIds = new Map<string, Set<string>>();

  for (const run of ingestRuns) {
    if (!run.route_source_id) continue;
    const bucket = ingestRunsBySourceId.get(run.route_source_id) || [];
    bucket.push(run);
    ingestRunsBySourceId.set(run.route_source_id, bucket);
  }

  for (const link of links) {
    if (!link.route_source_id || !link.verified_route_id || !routeById.has(link.verified_route_id)) continue;
    const bucket = sourceRouteIds.get(link.route_source_id) || new Set<string>();
    bucket.add(link.verified_route_id);
    sourceRouteIds.set(link.route_source_id, bucket);
  }

  const sourceSummaries = sources
    .map((source) => {
      const routeIds = sourceRouteIds.get(source.id) || new Set<string>();
      const sourceRoutes = Array.from(routeIds)
        .map((routeId) => routeById.get(routeId))
        .filter((route): route is RouteRecord => !!route);
      const sourceRuns = ingestRunsBySourceId.get(source.id) || [];
      const latestIngestRun = latestRunForSource(sourceRuns);
      const publicRecommendationCount = sourceRoutes.filter(isPublicRecommendation).length;
      const staleRouteCount = sourceRoutes.filter((route) => isStale(route, nowMs)).length;
      const activeClosureRouteCount = sourceRoutes.filter((route) => readNumber(route.active_closure_count) > 0).length;

      return {
        id: source.id,
        providerId: source.provider_id,
        name: source.name,
        sourceType: source.source_type,
        authority: source.authority,
        status: source.status,
        sourceUri: source.source_uri || null,
        attribution: source.attribution || null,
        license: source.license || null,
        lastCheckedAt: source.last_checked_at || null,
        routeCount: sourceRoutes.length,
        publicRecommendationCount,
        curationOnlyCount: Math.max(0, sourceRoutes.length - publicRecommendationCount),
        needsReviewCount: sourceRoutes.filter(needsReview).length,
        blockedRouteCount: sourceRoutes.filter(isBlocked).length,
        staleRouteCount,
        activeClosureRouteCount,
        rawFeatureCount: readNumber(latestIngestRun?.raw_feature_count),
        normalizedFeatureCount: readNumber(latestIngestRun?.normalized_feature_count),
        latestIngestRun: serializeLatestIngestRun(latestIngestRun),
      };
    })
    .sort((a, b) => b.routeCount - a.routeCount || a.providerId.localeCompare(b.providerId));

  const publicRecommendationCount = routes.filter(isPublicRecommendation).length;
  const staleRouteCount = routes.filter((route) => isStale(route, nowMs)).length;
  const activeClosureRouteCount = routes.filter((route) => readNumber(route.active_closure_count) > 0).length;
  const sumLatestRawFeatureCount = sourceSummaries.reduce((total, source) => total + readNumber(source.rawFeatureCount), 0);

  return {
    ok: true,
    generatedAt,
    maxRouteRows: limits.maxRouteRows,
    limits,
    totals: {
      sourceCount: sources.length,
      routeCount: routes.length,
      publicRecommendationCount,
      curationOnlyCount: Math.max(0, routes.length - publicRecommendationCount),
      needsReviewCount: routes.filter(needsReview).length,
      blockedRouteCount: routes.filter(isBlocked).length,
      staleRouteCount,
      activeClosureRouteCount,
      rawFeatureCount: rawFeatureCount ?? sumLatestRawFeatureCount,
      latestIngestRunCount: ingestRuns.length,
    },
    recommendationStatusCounts: countBy(routes as unknown as JsonRecord[], 'recommendation_status'),
    verificationStatusCounts: countBy(routes as unknown as JsonRecord[], 'verification_status'),
    reviewStatusCounts: countBy(routes as unknown as JsonRecord[], 'review_status'),
    sourceSummaries,
    truncated,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ ok: false, error: 'GET or POST required' }, 405);

  try {
    const params = await requestParams(req);
    const maxRouteRows = readBoundedInteger(params.maxRouteRows ?? params.max_route_rows, 1000, 100000);
    const maxLinkRows = readBoundedInteger(params.maxLinkRows ?? params.max_link_rows, 5000, 200000);
    const maxIngestRunRows = readBoundedInteger(params.maxIngestRunRows ?? params.max_ingest_run_rows, 500, 20000);
    const admin = createAdminClient();

    const [sourceResult, routeResult, ingestResult, rawFeatureCount] = await Promise.all([
      fetchPagedRows<SourceRecord>(
        admin,
        'route_sources',
        'id,provider_id,name,source_type,authority,status,last_checked_at,source_uri,attribution,license,refresh_frequency,updated_at',
        1000,
        'provider_id',
      ),
      fetchPagedRows<RouteRecord>(
        admin,
        'verified_routes',
        'id,recommendation_status,verification_status,review_status,confidence_score,active_closure_count,stale_at,updated_at,last_verified_at',
        maxRouteRows,
        'id',
      ),
      fetchPagedRows<IngestRun>(
        admin,
        'route_source_ingest_runs',
        'id,route_source_id,status,source_uri,source_version,started_at,finished_at,raw_feature_count,normalized_feature_count,error_message,metadata',
        maxIngestRunRows,
        'started_at',
      ),
      countRawSourceFeatures(admin),
    ]);
    const linkResult = await fetchRouteSourceLinksForRoutes(
      admin,
      routeResult.rows.map((route) => route.id),
      maxLinkRows,
    );

    return jsonResponse(buildSummary({
      sources: sourceResult.rows,
      routes: routeResult.rows,
      links: linkResult.rows,
      ingestRuns: ingestResult.rows,
      rawFeatureCount,
      truncated: {
        routeSources: sourceResult.truncated,
        verifiedRoutes: routeResult.truncated,
        verifiedRouteSources: linkResult.truncated || routeResult.truncated,
        ingestRuns: ingestResult.truncated,
      },
      limits: {
        maxRouteRows,
        maxLinkRows,
        maxIngestRunRows,
      },
    }));
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to summarize route catalog.',
      },
      500,
    );
  }
});

/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

type JsonRecord = Record<string, unknown>;

const REQUIRED_SUMMARY_FIELDS = [
  'sourceSummaries',
  'recommendationStatusCounts',
  'verificationStatusCounts',
  'reviewStatusCounts',
  'generatedAt',
  'maxRouteRows',
];

const REQUIRED_TOTAL_FIELDS = [
  'publicRecommendationCount',
  'curationOnlyCount',
  'staleRouteCount',
  'activeClosureRouteCount',
  'rawFeatureCount',
];

const SOURCE_SUMMARY_FIELDS = ['latestIngestRun'];

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

function normalizeSummary(data: unknown): JsonRecord {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('route_catalog_summary_report returned an invalid payload');
  }

  const summary = data as JsonRecord;
  for (const field of REQUIRED_SUMMARY_FIELDS) {
    if (!(field in summary)) {
      throw new Error(`route_catalog_summary_report missing ${field}`);
    }
  }

  const totals = summary.totals as JsonRecord | undefined;
  if (!totals || typeof totals !== 'object') throw new Error('route_catalog_summary_report missing totals');
  for (const field of REQUIRED_TOTAL_FIELDS) {
    if (!(field in totals)) throw new Error(`route_catalog_summary_report missing totals.${field}`);
  }

  const sourceSummaries = Array.isArray(summary.sourceSummaries) ? summary.sourceSummaries : [];
  if (sourceSummaries.length > 0 && typeof sourceSummaries[0] === 'object' && sourceSummaries[0] !== null) {
    for (const field of SOURCE_SUMMARY_FIELDS) {
      if (!(field in (sourceSummaries[0] as JsonRecord))) {
        throw new Error(`route_catalog_summary_report missing sourceSummaries.${field}`);
      }
    }
  }
  return summary;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ ok: false, error: 'GET or POST required' }, 405);

  try {
    const params = await requestParams(req);
    const maxRouteRows = readBoundedInteger(params.maxRouteRows ?? params.max_route_rows, 1000, 100000);
    const maxLinkRows = readBoundedInteger(params.maxLinkRows ?? params.max_link_rows, 5000, 200000);
    const maxIngestRunRows = readBoundedInteger(params.maxIngestRunRows ?? params.max_ingest_run_rows, 500, 20000);

    const { data, error } = await createAdminClient().rpc('route_catalog_summary_report', {
      p_max_route_rows: maxRouteRows,
      p_max_link_rows: maxLinkRows,
      p_max_ingest_run_rows: maxIngestRunRows,
    });

    if (error) throw new Error(`Unable to run route_catalog_summary_report: ${error.message}`);
    return jsonResponse(normalizeSummary(data));
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

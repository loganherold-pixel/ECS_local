/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
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

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length < 160 ? text : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

async function requestId(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  const queryId = cleanText(url.searchParams.get('id') ?? url.searchParams.get('public_id'));
  if (queryId) return queryId;
  if (req.method !== 'POST') return null;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return cleanText(body.id ?? body.publicId ?? body.public_id);
}

function buildAssessment(record: Record<string, unknown>) {
  const blockers = Array.isArray(record.blocker_reasons) ? record.blocker_reasons : [];
  const warnings = Array.isArray(record.warning_reasons) ? record.warning_reasons : [];
  const communitySignal = readRecord(record.community_signal);
  const activeGuidance = readRecord(communitySignal?.activeGuidance);
  const activeGuidanceWarning =
    typeof activeGuidance?.unavailableReason === 'string' && activeGuidance.unavailableReason.trim()
      ? activeGuidance.unavailableReason.trim()
      : null;
  return {
    status: blockers.length > 0 ? 'critical' : warnings.length > 0 ? 'watch' : 'normal',
    why: Array.isArray(record.confidence_reasons) ? record.confidence_reasons : [],
    whatToWatch: [...warnings, ...(activeGuidanceWarning ? [activeGuidanceWarning] : [])],
    recommendedAction: blockers.length > 0
      ? 'Do not recommend this route until blockers are cleared by official source review.'
      : 'Verify current local conditions before departure and cache the route for offline use.',
    toImproveStatus: blockers.length > 0
      ? blockers
      : ['Refresh official source checks', 'Confirm seasonal restrictions for the trip date'],
    confidence: record.confidence_score ?? 0,
    activeGuidance,
    dataUsed: record.source_records ?? [],
  };
}

function sourceRecords(record: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(record.source_records)
    ? record.source_records.map(readRecord).filter((source): source is Record<string, unknown> => !!source)
    : [];
}

function sourceTimestamps(record: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    values.push(text);
  };

  push(record.last_verified_at);
  sourceRecords(record).forEach((source) => {
    push(source.lastVerifiedAt);
    push(source.last_verified_at);
  });
  return values;
}

function sourceAttribution(record: Record<string, unknown>): Record<string, string | null>[] {
  return sourceRecords(record)
    .map((source) => {
      const providerId = readString(source, 'providerId', 'provider_id');
      const label = readString(source, 'label');
      if (!providerId || !label) return null;
      return {
        providerId,
        provider_id: providerId,
        label,
        attribution: readString(source, 'attribution'),
        license: readString(source, 'license'),
      };
    })
    .filter((source): source is Record<string, string | null> => !!source);
}

function freshnessWarnings(record: Record<string, unknown>): string[] {
  const warnings = new Set<string>();
  const staleAt = readString(record, 'stale_at', 'staleAt');
  if (staleAt) {
    const staleTime = Date.parse(staleAt);
    if (Number.isFinite(staleTime) && staleTime <= Date.now()) {
      warnings.add('Source stale. Refresh official source checks before offline use.');
    }
  }

  sourceRecords(record).forEach((source) => {
    const label = readString(source, 'label') ?? readString(source, 'providerId', 'provider_id') ?? 'Route source';
    const lastVerifiedAt = readString(source, 'lastVerifiedAt', 'last_verified_at');
    if (!lastVerifiedAt) warnings.add(`${label} source freshness is missing.`);
  });
  return Array.from(warnings);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ ok: false, error: 'GET or POST required' }, 405);

  try {
    const id = await requestId(req);
    if (!id) return jsonResponse({ ok: false, error: 'Route id or public_id required' }, 400);

    const admin = createAdminClient();
    let query = admin
      .from('route_catalog_public')
      .select('*')
      .eq('review_status', 'approved')
      .eq('recommendation_status', 'recommendable')
      .limit(1);

    query = isUuid(id) ? query.eq('id', id) : query.eq('public_id', id);

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error('Unable to read verified route detail.');
    if (!data) return jsonResponse({ ok: false, error: 'Verified route not found' }, 404);

    const record = data as Record<string, unknown>;
    return jsonResponse({
      ok: true,
      record,
      assessment: buildAssessment(record),
      offlineCache: {
        cacheable: Boolean(record.route_geometry),
        lastVerifiedAt: record.last_verified_at ?? null,
        staleAt: record.stale_at ?? null,
        sourceTimestamps: sourceTimestamps(record),
        sourceAttribution: sourceAttribution(record),
        freshnessWarnings: freshnessWarnings(record),
      },
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Verified route detail failed.',
    }, 500);
  }
});

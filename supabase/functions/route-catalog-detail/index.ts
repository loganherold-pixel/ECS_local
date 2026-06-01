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
      },
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Verified route detail failed.',
    }, 500);
  }
});

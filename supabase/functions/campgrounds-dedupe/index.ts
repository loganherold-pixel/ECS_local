/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buildCampgroundDedupePlan,
  type DedupeCampgroundRow,
  type DedupeGroupPlan,
  type DedupeSourceRecord,
} from '../_shared/campgroundDedupe.ts';

type DedupeRequestBody = {
  limit?: number;
  dryRun?: boolean;
};

type DedupeCounts = {
  recordsRead: number;
  groupsFound: number;
  canonicalRowsUpdated: number;
  duplicateRowsRemoved: number;
  sourceRecordsMoved: number;
  availabilityRowsMoved: number;
  errorCount: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const admin = createClient(getEnv('ECS_SUPABASE_URL'), getEnv('ECS_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Admin authorization required' }, 401) };
  }

  const { data: authUser, error: authError } = await admin.auth.getUser(token);
  if (authError || !authUser?.user?.id) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Unable to validate admin session' }, 401) };
  }

  const normalizedEmail = String(authUser.user.email ?? '').trim().toLowerCase();
  if (normalizedEmail === 'admin@expeditioncommand.com') return { ok: true };

  const { data: operator } = await admin
    .from('operators')
    .select('role, access_level, internal_account_type')
    .eq('user_id', authUser.user.id)
    .maybeSingle();

  const isAdmin =
    operator?.role === 'super_admin' ||
    operator?.access_level === 'super_admin' ||
    operator?.internal_account_type === 'admin_internal';

  if (!isAdmin) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Admin access required' }, 403) };
  }

  return { ok: true };
}

function numberParam(value: unknown, fallback: number, min: number, max: number): number {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(candidate)));
}

async function createSyncRun(): Promise<string | null> {
  const { data, error } = await admin
    .from('campground_sync_runs')
    .insert({ provider_id: 'dedupe', status: 'running' })
    .select('id')
    .single();
  if (error || !data?.id) return null;
  return String(data.id);
}

async function finishSyncRun(
  syncRunId: string | null,
  status: 'succeeded' | 'partial' | 'failed',
  counts: DedupeCounts,
  notes?: string | null,
): Promise<void> {
  if (!syncRunId) return;
  await admin
    .from('campground_sync_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_read: counts.recordsRead,
      records_upserted: counts.canonicalRowsUpdated + counts.sourceRecordsMoved + counts.availabilityRowsMoved,
      records_failed: counts.errorCount,
      error_count: counts.errorCount,
      notes: notes ? notes.slice(0, 800) : null,
    })
    .eq('id', syncRunId);
}

async function fetchCampgrounds(limit: number): Promise<DedupeCampgroundRow[]> {
  const { data, error } = await admin
    .from('campgrounds')
    .select('id, name, latitude, longitude, facility_type, managing_agency, managing_org, reservation_url, detail_url, status, availability_status, site_count, site_types, amenities, source_confidence, primary_provider, attribution, last_synced_at, last_verified_at, last_availability_checked_at')
    .neq('status', 'removed')
    .order('source_confidence', { ascending: false })
    .limit(limit);

  if (error) throw new Error('Unable to read campgrounds for dedupe.');
  return Array.isArray(data) ? (data as DedupeCampgroundRow[]) : [];
}

async function fetchSourceRecords(campgroundIds: string[]): Promise<DedupeSourceRecord[]> {
  if (!campgroundIds.length) return [];
  const { data, error } = await admin
    .from('campground_source_records')
    .select('campground_id, provider_id, provider_record_id, source_url, first_seen_at, last_seen_at')
    .in('campground_id', campgroundIds);

  if (error) throw new Error('Unable to read campground source records for dedupe.');
  return Array.isArray(data) ? (data as DedupeSourceRecord[]) : [];
}

function canonicalUpdate(plan: DedupeGroupPlan): Record<string, unknown> {
  const merged = plan.mergedCampground;
  return {
    name: merged.name,
    latitude: merged.latitude,
    longitude: merged.longitude,
    facility_type: merged.facility_type ?? 'campground',
    managing_agency: merged.managing_agency ?? null,
    managing_org: merged.managing_org ?? null,
    reservation_url: merged.reservation_url ?? null,
    detail_url: merged.detail_url ?? null,
    status: merged.status ?? 'unknown',
    availability_status: merged.availability_status ?? 'unknown',
    site_count: merged.site_count ?? null,
    site_types: merged.site_types ?? null,
    amenities: merged.amenities ?? null,
    source_confidence: merged.source_confidence ?? 0,
    primary_provider: merged.primary_provider ?? null,
    attribution: merged.attribution ?? null,
    last_synced_at: merged.last_synced_at ?? new Date().toISOString(),
    last_verified_at: merged.last_verified_at ?? null,
    last_availability_checked_at: merged.last_availability_checked_at ?? null,
  };
}

async function applyDedupePlan(plan: DedupeGroupPlan): Promise<{
  sourceRecordsMoved: number;
  availabilityRowsMoved: number;
}> {
  const duplicateIds = plan.duplicateIds;
  if (!duplicateIds.length) return { sourceRecordsMoved: 0, availabilityRowsMoved: 0 };

  const { error: canonicalError } = await admin
    .from('campgrounds')
    .update(canonicalUpdate(plan))
    .eq('id', plan.canonicalId);
  if (canonicalError) throw new Error(`Unable to update canonical campground ${plan.canonicalId}`);

  const { count: sourceCount, error: sourceError } = await admin
    .from('campground_source_records')
    .update({ campground_id: plan.canonicalId })
    .in('campground_id', duplicateIds)
    .select('id', { count: 'exact', head: true });
  if (sourceError) throw new Error(`Unable to move source records into canonical campground ${plan.canonicalId}`);

  const { count: availabilityCount, error: availabilityError } = await admin
    .from('campground_availability')
    .update({ campground_id: plan.canonicalId })
    .in('campground_id', duplicateIds)
    .select('id', { count: 'exact', head: true });
  if (availabilityError) throw new Error(`Unable to move availability records into canonical campground ${plan.canonicalId}`);

  const { error: removedError } = await admin
    .from('campgrounds')
    .update({
      status: 'removed',
      availability_status: 'unknown',
      attribution: plan.mergedCampground.attribution ?? null,
      last_synced_at: new Date().toISOString(),
    })
    .in('id', duplicateIds);
  if (removedError) throw new Error(`Unable to mark duplicate campgrounds removed for canonical ${plan.canonicalId}`);

  return {
    sourceRecordsMoved: sourceCount ?? 0,
    availabilityRowsMoved: availabilityCount ?? 0,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  const authorization = await requireAdmin(req);
  if (!authorization.ok) return authorization.response;

  const body = (await req.json().catch(() => ({}))) as DedupeRequestBody;
  const limit = numberParam(body.limit, 1000, 2, 5000);
  const dryRun = body.dryRun === true;
  const syncRunId = dryRun ? null : await createSyncRun();
  const counts: DedupeCounts = {
    recordsRead: 0,
    groupsFound: 0,
    canonicalRowsUpdated: 0,
    duplicateRowsRemoved: 0,
    sourceRecordsMoved: 0,
    availabilityRowsMoved: 0,
    errorCount: 0,
  };

  let finalStatus: 'succeeded' | 'partial' | 'failed' = 'succeeded';
  let notes: string | null = null;
  let plans: DedupeGroupPlan[] = [];

  try {
    const campgrounds = await fetchCampgrounds(limit);
    counts.recordsRead = campgrounds.length;
    const sources = await fetchSourceRecords(campgrounds.map((campground) => campground.id));
    plans = buildCampgroundDedupePlan(campgrounds, sources);
    counts.groupsFound = plans.length;

    if (!dryRun) {
      for (const plan of plans) {
        try {
          const moved = await applyDedupePlan(plan);
          counts.canonicalRowsUpdated += 1;
          counts.duplicateRowsRemoved += plan.duplicateIds.length;
          counts.sourceRecordsMoved += moved.sourceRecordsMoved;
          counts.availabilityRowsMoved += moved.availabilityRowsMoved;
        } catch (_error) {
          counts.errorCount += 1;
          finalStatus = 'partial';
        }
      }
    }
  } catch (error) {
    counts.errorCount += 1;
    finalStatus = counts.canonicalRowsUpdated > 0 ? 'partial' : 'failed';
    notes = error instanceof Error ? error.message : 'Campground dedupe failed.';
  }

  if (finalStatus === 'partial' && counts.canonicalRowsUpdated === 0 && counts.groupsFound > 0) {
    finalStatus = 'failed';
  }

  const audit = plans.slice(0, 25).map((plan) => ({
    canonicalId: plan.canonicalId,
    duplicateIds: plan.duplicateIds,
    reasons: plan.reasons,
  }));
  await finishSyncRun(syncRunId, finalStatus, counts, notes ?? JSON.stringify({ mergedGroups: audit }).slice(0, 800));

  return jsonResponse({
    ok: finalStatus !== 'failed',
    status: finalStatus,
    dryRun,
    counts,
    audit,
  }, finalStatus === 'failed' ? 500 : 200);
});

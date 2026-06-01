/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buildCampflareAvailabilityRows,
  buildCampflareAvailabilityUrl,
  campflareProviderError,
  getCampflarePageRecords,
  getNextCampflareCursor,
  normalizeCampflareRecord,
  selectBestCampflareMatch,
  type CampflareApiPage,
  type CampflareQuery,
  type CampflareRecord,
  type ExistingCampgroundCandidate,
  type NormalizedCampflareRecord,
} from './campflareAdapter.ts';

type SyncRequestBody = {
  limit?: number;
  maxPages?: number;
  cursor?: string | null;
  state?: string;
  updatedSince?: string;
  ttlSeconds?: number;
  dryRun?: boolean;
};

type SyncCounts = {
  recordsRead: number;
  recordsMatched: number;
  recordsUnmatched: number;
  recordsUpserted: number;
  recordsFailed: number;
  errorCount: number;
  pagesFetched: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const REQUEST_TIMEOUT_MS = 15000;
const RATE_LIMIT_RETRY_MS = 2000;
const DEFAULT_CAMPFLARE_BASE_URL = 'https://campflare.com/api';
const DEFAULT_TTL_SECONDS = 900;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getEnvOrNull(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.trim().length > 0 ? value.trim() : null;
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

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type CampflareProviderConfig = {
  attributionText: string;
  baseUrl: string;
  cacheTtlSeconds: number;
};

function buildQuery(body: SyncRequestBody, cursor: string | null, limit: number, baseUrl: string): CampflareQuery {
  return {
    baseUrl,
    limit,
    cursor,
    state: typeof body.state === 'string' && body.state.trim() ? body.state.trim() : undefined,
    updatedSince: typeof body.updatedSince === 'string' && body.updatedSince.trim() ? body.updatedSince.trim() : undefined,
  };
}

async function fetchCampflarePage(url: string, apiKey: string, attempt = 0): Promise<CampflareApiPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : RATE_LIMIT_RETRY_MS);
        return fetchCampflarePage(url, apiKey, attempt + 1);
      }

      const providerError = campflareProviderError(response.status, body);
      throw new Error(`${providerError.code}: ${providerError.message}`);
    }

    if (!body || typeof body !== 'object') {
      throw new Error('CAMPFLARE_PROVIDER_ERROR: Campflare returned malformed JSON.');
    }

    return body as CampflareApiPage;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeAttribution(existing: string | null | undefined, providerAttribution: string): string {
  const current = String(existing ?? '').trim();
  const next = providerAttribution.trim() || 'Campflare';
  if (!current) return next;
  return current.toLowerCase().includes(next.toLowerCase()) ? current : `${current}; ${next}`;
}

async function createSyncRun(): Promise<string | null> {
  const { data, error } = await admin
    .from('campground_sync_runs')
    .insert({ provider_id: 'campflare', status: 'running' })
    .select('id')
    .single();
  if (error || !data?.id) return null;
  return String(data.id);
}

async function getCampflareConfig(): Promise<CampflareProviderConfig> {
  const { data } = await admin
    .from('campground_provider_configs')
    .select('attribution_text, cache_ttl_seconds, base_url')
    .eq('provider_id', 'campflare')
    .maybeSingle();

  const configuredBaseUrl = typeof data?.base_url === 'string' && data.base_url.trim()
    ? data.base_url.trim()
    : getEnvOrNull('CAMPFLARE_BASE_URL');
  const configuredTtl = Number(data?.cache_ttl_seconds);

  return {
    attributionText: typeof data?.attribution_text === 'string' && data.attribution_text.trim()
      ? data.attribution_text.trim()
      : 'Campflare',
    baseUrl: configuredBaseUrl ?? DEFAULT_CAMPFLARE_BASE_URL,
    cacheTtlSeconds: Number.isFinite(configuredTtl) && configuredTtl > 0
      ? Math.max(60, Math.min(3600, Math.floor(configuredTtl)))
      : DEFAULT_TTL_SECONDS,
  };
}

async function finishSyncRun(
  syncRunId: string | null,
  status: 'succeeded' | 'partial' | 'failed',
  counts: SyncCounts,
  notes?: string | null,
): Promise<void> {
  if (!syncRunId) return;
  await admin
    .from('campground_sync_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_read: counts.recordsRead,
      records_upserted: counts.recordsUpserted,
      records_failed: counts.recordsFailed,
      error_count: counts.errorCount,
      notes: notes ? notes.slice(0, 800) : null,
    })
    .eq('id', syncRunId);
}

async function findExistingCampflareSource(providerRecordId: string): Promise<{ campground_id: string | null; first_seen_at: string | null } | null> {
  const { data } = await admin
    .from('campground_source_records')
    .select('campground_id, first_seen_at')
    .eq('provider_id', 'campflare')
    .eq('provider_record_id', providerRecordId)
    .maybeSingle();

  if (!data) return null;
  return {
    campground_id: typeof data.campground_id === 'string' ? data.campground_id : null,
    first_seen_at: typeof data.first_seen_at === 'string' ? data.first_seen_at : null,
  };
}

async function findCampgroundById(id: string): Promise<ExistingCampgroundCandidate | null> {
  const { data } = await admin
    .from('campgrounds')
    .select('id, name, latitude, longitude, reservation_url, detail_url, primary_provider, source_confidence, attribution')
    .eq('id', id)
    .maybeSingle();
  return data ? (data as ExistingCampgroundCandidate) : null;
}

async function findNearbyCampgroundMatch(normalized: NormalizedCampflareRecord): Promise<ExistingCampgroundCandidate | null> {
  const reservationUrl = normalized.reservationUrl ?? normalized.sourceUrl;
  if (reservationUrl) {
    const { data } = await admin
      .from('campgrounds')
      .select('id, name, latitude, longitude, reservation_url, detail_url, primary_provider, source_confidence, attribution')
      .or(`reservation_url.eq.${reservationUrl},detail_url.eq.${reservationUrl}`)
      .limit(5);
    const matched = selectBestCampflareMatch(normalized, Array.isArray(data) ? (data as ExistingCampgroundCandidate[]) : []);
    if (matched) return matched;
  }

  if (normalized.latitude == null || normalized.longitude == null) return null;
  const delta = 0.02;
  const { data } = await admin
    .from('campgrounds')
    .select('id, name, latitude, longitude, reservation_url, detail_url, primary_provider, source_confidence, attribution')
    .gte('latitude', normalized.latitude - delta)
    .lte('latitude', normalized.latitude + delta)
    .gte('longitude', normalized.longitude - delta)
    .lte('longitude', normalized.longitude + delta)
    .limit(25);

  return selectBestCampflareMatch(normalized, Array.isArray(data) ? (data as ExistingCampgroundCandidate[]) : []);
}

async function upsertCampflareSource(
  normalized: NormalizedCampflareRecord,
  campgroundId: string | null,
  existingFirstSeenAt: string | null | undefined,
): Promise<void> {
  const sourceRecord = {
    ...normalized.sourceRecord,
    campground_id: campgroundId,
    first_seen_at: existingFirstSeenAt ?? normalized.sourceRecord.first_seen_at,
    last_seen_at: normalized.lastCheckedAt,
  };

  const { error } = await admin
    .from('campground_source_records')
    .upsert(sourceRecord, { onConflict: 'provider_id,provider_record_id' });
  if (error) throw new Error(`Campflare source upsert failed for ${normalized.providerRecordId}`);
}

async function upsertCampflareAvailabilityRow(
  availability: ReturnType<typeof buildCampflareAvailabilityRows>['availability'],
): Promise<void> {
  const { data: existing } = await admin
    .from('campground_availability')
    .select('id')
    .eq('provider_id', availability.provider_id)
    .eq('campground_id', availability.campground_id)
    .is('date', null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from('campground_availability')
      .update(availability)
      .eq('id', existing.id);
    if (error) throw new Error(`Campflare availability update failed for ${availability.campground_id}`);
    return;
  }

  const { error } = await admin
    .from('campground_availability')
    .insert(availability);
  if (error) throw new Error(`Campflare availability insert failed for ${availability.campground_id}`);
}

async function upsertCampflareAvailability(
  normalized: NormalizedCampflareRecord,
  nowIso: string,
  attributionText: string,
): Promise<'matched' | 'unmatched'> {
  const existingSource = await findExistingCampflareSource(normalized.providerRecordId);
  const existingBySource = existingSource?.campground_id ? await findCampgroundById(existingSource.campground_id) : null;
  const match = existingBySource ?? (await findNearbyCampgroundMatch(normalized));
  const campgroundId = match?.id ?? null;

  if (!campgroundId) {
    await upsertCampflareSource(normalized, null, existingSource?.first_seen_at);
    return 'unmatched';
  }

  const rows = buildCampflareAvailabilityRows(normalized, campgroundId, nowIso);
  await upsertCampflareSource(normalized, campgroundId, existingSource?.first_seen_at);
  await upsertCampflareAvailabilityRow(rows.availability);

  if (rows.canonicalAvailabilityStatus !== 'unknown') {
    await admin
      .from('campgrounds')
      .update({
        availability_status: rows.canonicalAvailabilityStatus,
        last_availability_checked_at: rows.canonicalLastAvailabilityCheckedAt,
        attribution: mergeAttribution(match?.attribution, attributionText),
      })
      .eq('id', campgroundId);
  }

  return 'matched';
}

async function updateProviderLastSynced(): Promise<void> {
  await admin
    .from('campground_provider_configs')
    .update({
      last_synced_at: new Date().toISOString(),
      health_status: 'healthy',
    })
    .eq('provider_id', 'campflare');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  const authorization = await requireAdmin(req);
  if (!authorization.ok) return authorization.response;

  const apiKey = getEnvOrNull('CAMPFLARE_API_KEY');
  if (!apiKey) return jsonResponse({ ok: false, error: 'CAMPFLARE_API_KEY is not configured' }, 500);

  const body = (await req.json().catch(() => ({}))) as SyncRequestBody;
  const limit = numberParam(body.limit, 100, 1, 100);
  const maxPages = numberParam(body.maxPages, 10, 1, 50);
  let cursor = typeof body.cursor === 'string' && body.cursor.trim() ? body.cursor.trim() : null;
  const dryRun = body.dryRun === true;
  const config = await getCampflareConfig();
  const ttlSeconds = numberParam(body.ttlSeconds, config.cacheTtlSeconds, 60, 3600);
  const syncRunId = dryRun ? null : await createSyncRun();
  const counts: SyncCounts = {
    recordsRead: 0,
    recordsMatched: 0,
    recordsUnmatched: 0,
    recordsUpserted: 0,
    recordsFailed: 0,
    errorCount: 0,
    pagesFetched: 0,
  };

  let finalStatus: 'succeeded' | 'partial' | 'failed' = 'succeeded';
  let notes: string | null = null;

  try {
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const query = buildQuery(body, cursor, limit, config.baseUrl);
      const page = await fetchCampflarePage(buildCampflareAvailabilityUrl(query), apiKey);
      counts.pagesFetched += 1;
      const records: CampflareRecord[] = getCampflarePageRecords(page);
      counts.recordsRead += records.length;

      for (const record of records) {
        const syncedAt = new Date().toISOString();
        const normalized = normalizeCampflareRecord(record, {
          syncedAt,
          ttlSeconds,
        });
        if (!normalized) {
          counts.recordsFailed += 1;
          continue;
        }

        if (dryRun) {
          counts.recordsUpserted += 1;
          continue;
        }

        try {
          const result = await upsertCampflareAvailability(normalized, syncedAt, config.attributionText);
          if (result === 'matched') {
            counts.recordsMatched += 1;
            counts.recordsUpserted += 1;
          } else {
            counts.recordsUnmatched += 1;
          }
        } catch (_error) {
          counts.recordsFailed += 1;
          counts.errorCount += 1;
          finalStatus = 'partial';
        }
      }

      cursor = getNextCampflareCursor(page);
      if (!cursor) break;
    }
  } catch (error) {
    counts.errorCount += 1;
    finalStatus = counts.recordsUpserted > 0 ? 'partial' : 'failed';
    notes = error instanceof Error ? error.message : 'Campflare sync failed.';
  }

  if (!dryRun && finalStatus !== 'failed') await updateProviderLastSynced();
  await finishSyncRun(syncRunId, finalStatus, counts, notes);

  return jsonResponse({
    ok: finalStatus !== 'failed',
    providerId: 'campflare',
    status: finalStatus,
    dryRun,
    counts,
    notes,
  }, finalStatus === 'failed' ? 500 : 200);
});

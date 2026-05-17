/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildReservationProviderCampgroundsUrl,
  buildReservationProviderSyncRows,
  getNextReservationProviderCursor,
  getNextReservationProviderOffset,
  getReservationProviderPageRecords,
  mergeReservationProviderIntoExistingCampground,
  normalizeReservationProviderRecord,
  reservationProviderError,
  selectBestReservationProviderMatch,
  type ExistingCampgroundCandidate,
  type ExistingReservationSourceRecord,
  type NormalizedReservationCampground,
  type ReservationProviderId,
  type ReservationProviderPage,
  type ReservationProviderRecord,
} from './campgroundReservationProviderAdapter.ts';

type SyncRequestBody = {
  limit?: number;
  maxPages?: number;
  cursor?: string | null;
  offset?: number;
  state?: string;
  updatedSince?: string;
  dryRun?: boolean;
};

type SyncCounts = {
  recordsRead: number;
  recordsCreated: number;
  recordsEnriched: number;
  recordsUpserted: number;
  recordsFailed: number;
  errorCount: number;
  pagesFetched: number;
};

export type ReservationProviderSyncOptions = {
  providerId: ReservationProviderId;
  displayName: string;
  defaultBaseUrl: string;
  requiredSecretRefs: string[];
  buildAuthHeaders: (secrets: Record<string, string>) => Record<string, string>;
};

type ProviderConfig = {
  attributionText: string;
  baseUrl: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const REQUEST_TIMEOUT_MS = 15000;
const RATE_LIMIT_RETRY_MS = 2000;

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

function readRequiredSecrets(secretRefs: string[]): { ok: true; secrets: Record<string, string> } | { ok: false; missing: string[] } {
  const secrets: Record<string, string> = {};
  const missing: string[] = [];

  for (const ref of secretRefs) {
    const value = getEnvOrNull(ref);
    if (!value) missing.push(ref);
    else secrets[ref] = value;
  }

  return missing.length > 0 ? { ok: false, missing } : { ok: true, secrets };
}

async function fetchProviderPage(
  options: ReservationProviderSyncOptions,
  url: string,
  headers: Record<string, string>,
  attempt = 0,
): Promise<ReservationProviderPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : RATE_LIMIT_RETRY_MS);
        return fetchProviderPage(options, url, headers, attempt + 1);
      }

      const providerError = reservationProviderError(options.providerId, response.status, body);
      throw new Error(`${providerError.code}: ${providerError.message}`);
    }

    if (!body || typeof body !== 'object') {
      throw new Error(`${options.providerId.toUpperCase()}_PROVIDER_ERROR: ${options.displayName} returned malformed JSON.`);
    }

    return body as ReservationProviderPage;
  } finally {
    clearTimeout(timeout);
  }
}

async function getProviderConfig(options: ReservationProviderSyncOptions): Promise<ProviderConfig> {
  const { data } = await admin
    .from('campground_provider_configs')
    .select('attribution_text, base_url')
    .eq('provider_id', options.providerId)
    .maybeSingle();

  return {
    attributionText: typeof data?.attribution_text === 'string' && data.attribution_text.trim()
      ? data.attribution_text.trim()
      : options.displayName,
    baseUrl: typeof data?.base_url === 'string' && data.base_url.trim()
      ? data.base_url.trim()
      : options.defaultBaseUrl,
  };
}

async function createSyncRun(providerId: ReservationProviderId): Promise<string | null> {
  const { data, error } = await admin
    .from('campground_sync_runs')
    .insert({ provider_id: providerId, status: 'running' })
    .select('id')
    .single();
  if (error || !data?.id) return null;
  return String(data.id);
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

async function findExistingSource(
  providerId: ReservationProviderId,
  providerRecordId: string,
): Promise<ExistingReservationSourceRecord | null> {
  const { data } = await admin
    .from('campground_source_records')
    .select('campground_id, first_seen_at')
    .eq('provider_id', providerId)
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
    .select('id, name, latitude, longitude, managing_agency, managing_org, reservation_url, detail_url, primary_provider, source_confidence, attribution')
    .eq('id', id)
    .maybeSingle();
  return data ? (data as ExistingCampgroundCandidate) : null;
}

async function findNearbyCampgroundMatch(normalized: NormalizedReservationCampground): Promise<ExistingCampgroundCandidate | null> {
  const url = normalized.campground.reservation_url ?? normalized.campground.detail_url;
  if (url) {
    const { data } = await admin
      .from('campgrounds')
      .select('id, name, latitude, longitude, managing_agency, managing_org, reservation_url, detail_url, primary_provider, source_confidence, attribution')
      .or(`reservation_url.eq.${url},detail_url.eq.${url}`)
      .limit(10);
    const matched = selectBestReservationProviderMatch(normalized, Array.isArray(data) ? (data as ExistingCampgroundCandidate[]) : []);
    if (matched) return matched;
  }

  const delta = 0.02;
  const { data } = await admin
    .from('campgrounds')
    .select('id, name, latitude, longitude, managing_agency, managing_org, reservation_url, detail_url, primary_provider, source_confidence, attribution')
    .gte('latitude', normalized.campground.latitude - delta)
    .lte('latitude', normalized.campground.latitude + delta)
    .gte('longitude', normalized.campground.longitude - delta)
    .lte('longitude', normalized.campground.longitude + delta)
    .limit(25);

  return selectBestReservationProviderMatch(normalized, Array.isArray(data) ? (data as ExistingCampgroundCandidate[]) : []);
}

async function upsertCampground(
  normalized: NormalizedReservationCampground,
  seenAt: string,
): Promise<'created' | 'enriched'> {
  const existingSource = await findExistingSource(normalized.providerId, normalized.providerRecordId);
  const existingBySource = existingSource?.campground_id ? await findCampgroundById(existingSource.campground_id) : null;
  const matched = existingBySource ?? (await findNearbyCampgroundMatch(normalized));
  let campgroundId = matched?.id ?? null;

  if (campgroundId && matched) {
    const merged = mergeReservationProviderIntoExistingCampground(matched, normalized, seenAt);
    const { error } = await admin.from('campgrounds').update(merged).eq('id', campgroundId);
    if (error) throw new Error(`${normalized.providerId} campground merge failed for ${normalized.providerRecordId}`);
  } else {
    const { data, error } = await admin
      .from('campgrounds')
      .insert({ ...normalized.campground, availability_status: 'unknown', last_synced_at: seenAt })
      .select('id')
      .single();
    if (error || !data?.id) throw new Error(`${normalized.providerId} campground insert failed for ${normalized.providerRecordId}`);
    campgroundId = String(data.id);
  }

  const rows = buildReservationProviderSyncRows(normalized, campgroundId, existingSource, seenAt);
  const { error: sourceError } = await admin
    .from('campground_source_records')
    .upsert(rows.sourceRecord, { onConflict: 'provider_id,provider_record_id' });
  if (sourceError) throw new Error(`${normalized.providerId} source upsert failed for ${normalized.providerRecordId}`);

  return matched ? 'enriched' : 'created';
}

async function updateProviderLastSynced(providerId: ReservationProviderId): Promise<void> {
  await admin
    .from('campground_provider_configs')
    .update({
      last_synced_at: new Date().toISOString(),
      health_status: 'healthy',
    })
    .eq('provider_id', providerId);
}

export function createReservationProviderSyncHandler(options: ReservationProviderSyncOptions) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

    const authorization = await requireAdmin(req);
    if (!authorization.ok) return authorization.response;

    const secretResult = readRequiredSecrets(options.requiredSecretRefs);
    if (!secretResult.ok) {
      return jsonResponse({
        ok: false,
        error: `${options.displayName} provider secrets are not configured`,
        missingSecretRefs: secretResult.missing,
      }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as SyncRequestBody;
    const limit = numberParam(body.limit, 100, 1, 100);
    const maxPages = numberParam(body.maxPages, 10, 1, 50);
    let offset = numberParam(body.offset, 0, 0, 1000000);
    let cursor = typeof body.cursor === 'string' && body.cursor.trim() ? body.cursor.trim() : null;
    const dryRun = body.dryRun === true;
    const config = await getProviderConfig(options);
    const headers = options.buildAuthHeaders(secretResult.secrets);
    const syncRunId = dryRun ? null : await createSyncRun(options.providerId);
    const counts: SyncCounts = {
      recordsRead: 0,
      recordsCreated: 0,
      recordsEnriched: 0,
      recordsUpserted: 0,
      recordsFailed: 0,
      errorCount: 0,
      pagesFetched: 0,
    };

    let finalStatus: 'succeeded' | 'partial' | 'failed' = 'succeeded';
    let notes: string | null = null;

    try {
      for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
        const url = buildReservationProviderCampgroundsUrl({
          providerId: options.providerId,
          baseUrl: config.baseUrl,
          limit,
          cursor,
          offset,
          state: typeof body.state === 'string' && body.state.trim() ? body.state.trim() : undefined,
          updatedSince: typeof body.updatedSince === 'string' && body.updatedSince.trim() ? body.updatedSince.trim() : undefined,
        });
        const page = await fetchProviderPage(options, url, headers);
        counts.pagesFetched += 1;
        const records: ReservationProviderRecord[] = getReservationProviderPageRecords(page);
        counts.recordsRead += records.length;

        for (const record of records) {
          const seenAt = new Date().toISOString();
          const normalized = normalizeReservationProviderRecord(options.providerId, record, {
            attributionText: config.attributionText,
            syncedAt: seenAt,
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
            const result = await upsertCampground(normalized, seenAt);
            counts.recordsUpserted += 1;
            if (result === 'created') counts.recordsCreated += 1;
            if (result === 'enriched') counts.recordsEnriched += 1;
          } catch (_error) {
            counts.recordsFailed += 1;
            counts.errorCount += 1;
            finalStatus = 'partial';
          }
        }

        const nextCursor = getNextReservationProviderCursor(page);
        if (nextCursor) {
          cursor = nextCursor;
          continue;
        }

        const nextOffset = getNextReservationProviderOffset(page, offset);
        if (nextOffset == null) break;
        offset = nextOffset;
      }
    } catch (error) {
      counts.errorCount += 1;
      finalStatus = counts.recordsUpserted > 0 ? 'partial' : 'failed';
      notes = error instanceof Error ? error.message : `${options.displayName} sync failed.`;
    }

    if (!dryRun && finalStatus !== 'failed') await updateProviderLastSynced(options.providerId);
    await finishSyncRun(syncRunId, finalStatus, counts, notes);

    return jsonResponse({
      ok: finalStatus !== 'failed',
      providerId: options.providerId,
      status: finalStatus,
      dryRun,
      counts,
      notes,
    }, finalStatus === 'failed' ? 500 : 200);
  };
}

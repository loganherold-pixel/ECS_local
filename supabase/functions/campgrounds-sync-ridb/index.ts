/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buildRidbFacilitiesUrl,
  buildRidbSyncRows,
  dedupeRidbRecords,
  getNextRidbOffset,
  getRidbPageRecords,
  normalizeRidbFacilityRecord,
  ridbProviderError,
  type ExistingRidbSourceRecord,
  type NormalizedRidbCampground,
  type RidbFacilitiesPage,
  type RidbFacilitiesQuery,
  type RidbFacilityRecord,
} from './ridbAdapter.ts';

type SyncRequestBody = {
  limit?: number;
  maxPages?: number;
  offset?: number;
  query?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  dryRun?: boolean;
};

type SyncCounts = {
  recordsRead: number;
  recordsUpserted: number;
  recordsFailed: number;
  errorCount: number;
  pagesFetched: number;
};

type SyncFailureDiagnostic = {
  stage: string;
  providerRecordId?: string;
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const RIDB_BASE_URL = 'https://ridb.recreation.gov/api/v1';
const REQUEST_TIMEOUT_MS = 15000;
const RATE_LIMIT_RETRY_MS = 2000;
const MAX_FAILURE_DIAGNOSTICS = 5;
const SENSITIVE_DIAGNOSTIC_PATTERN = /(authorization|bearer|apikey|api_key|token|secret|password|cookie|service_role|jwt)/i;

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

function sanitizeDiagnosticText(value: unknown, maxLength = 240): string | null {
  if (value == null) return null;

  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (SENSITIVE_DIAGNOSTIC_PATTERN.test(normalized)) return '[redacted]';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

class SyncWriteError extends Error {
  stage: string;
  providerRecordId: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;

  constructor(stage: string, providerRecordId: string, fallbackMessage: string, cause?: unknown) {
    const causeRecord = cause && typeof cause === 'object' ? (cause as Record<string, unknown>) : {};
    const causeMessage = cause instanceof Error ? cause.message : undefined;
    const message = sanitizeDiagnosticText(causeRecord.message ?? causeMessage ?? fallbackMessage) ?? fallbackMessage;
    super(`${stage}: ${message}`);
    this.name = 'SyncWriteError';
    this.stage = stage;
    this.providerRecordId = providerRecordId;
    this.code = sanitizeDiagnosticText(causeRecord.code, 80);
    this.details = sanitizeDiagnosticText(causeRecord.details);
    this.hint = sanitizeDiagnosticText(causeRecord.hint);
  }
}

function throwWriteError(stage: string, providerRecordId: string, cause: unknown, fallbackMessage: string): never {
  throw new SyncWriteError(stage, providerRecordId, fallbackMessage, cause);
}

function toFailureDiagnostic(error: unknown, providerRecordId?: string): SyncFailureDiagnostic {
  if (error instanceof SyncWriteError) {
    return {
      stage: error.stage,
      providerRecordId: error.providerRecordId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    };
  }

  return {
    stage: 'record_sync',
    providerRecordId,
    message: sanitizeDiagnosticText(error instanceof Error ? error.message : error) ?? 'Unknown RIDB record sync failure.',
  };
}

function addFailureDiagnostic(
  failureDiagnostics: SyncFailureDiagnostic[],
  error: unknown,
  providerRecordId?: string,
): void {
  if (failureDiagnostics.length >= MAX_FAILURE_DIAGNOSTICS) return;
  failureDiagnostics.push(toFailureDiagnostic(error, providerRecordId));
}

function firstFailureNote(failureDiagnostics: SyncFailureDiagnostic[]): string | null {
  const first = failureDiagnostics[0];
  return first ? `${first.stage}: ${first.message}`.slice(0, 800) : null;
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
  if (normalizedEmail === 'admin@expeditioncommand.com') {
    return { ok: true };
  }

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

function optionalNumber(value: unknown): number | undefined {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : undefined;
}

function buildQuery(body: SyncRequestBody, offset: number, limit: number): RidbFacilitiesQuery {
  return {
    baseUrl: RIDB_BASE_URL,
    limit,
    offset,
    query: typeof body.query === 'string' && body.query.trim() ? body.query.trim() : 'campground',
    state: typeof body.state === 'string' && body.state.trim() ? body.state.trim() : undefined,
    latitude: optionalNumber(body.latitude),
    longitude: optionalNumber(body.longitude),
    radius: optionalNumber(body.radius),
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRidbPage(url: string, apiKey: string, attempt = 0): Promise<RidbFacilitiesPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        apikey: apiKey,
      },
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : RATE_LIMIT_RETRY_MS);
        return fetchRidbPage(url, apiKey, attempt + 1);
      }

      const providerError = ridbProviderError(response.status, body);
      throw new Error(`${providerError.code}: ${providerError.message}`);
    }

    if (!body || typeof body !== 'object') {
      throw new Error('RIDB_PROVIDER_ERROR: RIDB returned malformed JSON.');
    }

    return body as RidbFacilitiesPage;
  } finally {
    clearTimeout(timeout);
  }
}

async function getRidbAttribution(): Promise<string> {
  const { data } = await admin
    .from('campground_provider_configs')
    .select('attribution_text')
    .eq('provider_id', 'ridb')
    .maybeSingle();

  const attribution = typeof data?.attribution_text === 'string' ? data.attribution_text.trim() : '';
  return attribution || 'RIDB / Recreation.gov';
}

async function createSyncRun(): Promise<string | null> {
  const { data, error } = await admin
    .from('campground_sync_runs')
    .insert({
      provider_id: 'ridb',
      status: 'running',
    })
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

async function findExistingSource(providerRecordId: string): Promise<ExistingRidbSourceRecord | null> {
  const { data } = await admin
    .from('campground_source_records')
    .select('campground_id, first_seen_at')
    .eq('provider_id', 'ridb')
    .eq('provider_record_id', providerRecordId)
    .maybeSingle();

  if (!data) return null;
  return {
    campground_id: typeof data.campground_id === 'string' ? data.campground_id : null,
    first_seen_at: typeof data.first_seen_at === 'string' ? data.first_seen_at : null,
  };
}

async function upsertCampground(normalized: NormalizedRidbCampground, seenAt: string): Promise<void> {
  const existingSource = await findExistingSource(normalized.providerRecordId);
  let campgroundId = existingSource?.campground_id ?? null;

  if (campgroundId) {
    const { error } = await admin
      .from('campgrounds')
      .update({
        ...normalized.campground,
        last_synced_at: seenAt,
      })
      .eq('id', campgroundId);
    if (error) throwWriteError('campground_update', normalized.providerRecordId, error, 'RIDB campground update failed.');
  } else {
    const { data, error } = await admin
      .from('campgrounds')
      .insert({
        ...normalized.campground,
        last_synced_at: seenAt,
      })
      .select('id')
      .single();
    if (error) throwWriteError('campground_insert', normalized.providerRecordId, error, 'RIDB campground insert failed.');
    if (!data?.id) {
      throwWriteError('campground_insert', normalized.providerRecordId, null, 'RIDB campground insert returned no id.');
    }
    campgroundId = String(data.id);
  }

  const rows = buildRidbSyncRows(normalized, campgroundId, existingSource, seenAt);
  const { error: sourceError } = await admin
    .from('campground_source_records')
    .upsert(rows.sourceRecord, { onConflict: 'provider_id,provider_record_id' });

  if (sourceError) {
    throwWriteError('source_record_upsert', normalized.providerRecordId, sourceError, 'RIDB source record upsert failed.');
  }
}

async function updateProviderLastSynced(): Promise<void> {
  await admin
    .from('campground_provider_configs')
    .update({
      last_synced_at: new Date().toISOString(),
      health_status: 'healthy',
    })
    .eq('provider_id', 'ridb');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'POST required' }, 405);
  }

  const authorization = await requireAdmin(req);
  if (!authorization.ok) return authorization.response;

  const apiKey = getEnvOrNull('RIDB_API_KEY');
  if (!apiKey) {
    return jsonResponse({ ok: false, error: 'RIDB_API_KEY is not configured' }, 500);
  }

  const body = (await req.json().catch(() => ({}))) as SyncRequestBody;
  const limit = numberParam(body.limit, 50, 1, 50);
  const maxPages = numberParam(body.maxPages, 10, 1, 50);
  let offset = numberParam(body.offset, 0, 0, 1000000);
  const dryRun = body.dryRun === true;
  const attribution = await getRidbAttribution();
  const syncRunId = dryRun ? null : await createSyncRun();
  const counts: SyncCounts = {
    recordsRead: 0,
    recordsUpserted: 0,
    recordsFailed: 0,
    errorCount: 0,
    pagesFetched: 0,
  };

  let finalStatus: 'succeeded' | 'partial' | 'failed' = 'succeeded';
  let notes: string | null = null;
  const failureDiagnostics: SyncFailureDiagnostic[] = [];

  try {
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const query = buildQuery(body, offset, limit);
      const url = buildRidbFacilitiesUrl(query);
      const page = await fetchRidbPage(url, apiKey);
      counts.pagesFetched += 1;

      const pageRecords: RidbFacilityRecord[] = dedupeRidbRecords(getRidbPageRecords(page));
      counts.recordsRead += pageRecords.length;

      for (const record of pageRecords) {
        const seenAt = new Date().toISOString();
        const normalized = normalizeRidbFacilityRecord(record, { attributionText: attribution, syncedAt: seenAt });
        if (!normalized) {
          counts.recordsFailed += 1;
          addFailureDiagnostic(failureDiagnostics, 'RIDB record could not be normalized.');
          continue;
        }

        if (dryRun) {
          counts.recordsUpserted += 1;
          continue;
        }

        try {
          await upsertCampground(normalized, seenAt);
          counts.recordsUpserted += 1;
        } catch (error) {
          counts.recordsFailed += 1;
          counts.errorCount += 1;
          finalStatus = 'partial';
          addFailureDiagnostic(failureDiagnostics, error, normalized.providerRecordId);
        }
      }

      const nextOffset = getNextRidbOffset(page, offset, limit);
      if (nextOffset == null) break;
      offset = nextOffset;
    }
  } catch (error) {
    counts.errorCount += 1;
    finalStatus = counts.recordsUpserted > 0 ? 'partial' : 'failed';
    notes = error instanceof Error ? error.message : 'RIDB sync failed.';
  }

  if (!dryRun && finalStatus !== 'failed') {
    await updateProviderLastSynced();
  }

  if (!notes) notes = firstFailureNote(failureDiagnostics);
  await finishSyncRun(syncRunId, finalStatus, counts, notes);

  return jsonResponse({
    ok: finalStatus !== 'failed',
    providerId: 'ridb',
    status: finalStatus,
    dryRun,
    counts,
    notes,
    failureDiagnostics,
  }, finalStatus === 'failed' ? 500 : 200);
});

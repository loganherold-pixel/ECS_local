/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buildNpsAlertsUrl,
  buildNpsCampgroundsUrl,
  buildNpsParksUrl,
  buildNpsSyncRows,
  getNextNpsStart,
  getNpsPageRecords,
  mergeNpsIntoExistingCampground,
  normalizeNpsCampgroundRecord,
  npsProviderError,
  selectBestNpsCampgroundMatch,
  type ExistingCampgroundCandidate,
  type ExistingNpsSourceRecord,
  type NormalizedNpsCampground,
  type NpsAlertRecord,
  type NpsApiPage,
  type NpsCampgroundRecord,
  type NpsCampgroundsQuery,
  type NpsContext,
  type NpsParkRecord,
} from './npsAdapter.ts';

type SyncRequestBody = {
  limit?: number;
  maxPages?: number;
  start?: number;
  parkCode?: string;
  stateCode?: string;
  query?: string;
  dryRun?: boolean;
};

type SyncCounts = {
  recordsRead: number;
  recordsUpserted: number;
  recordsEnriched: number;
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

const NPS_BASE_URL = 'https://developer.nps.gov/api/v1';
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
    message: sanitizeDiagnosticText(error instanceof Error ? error.message : error) ?? 'Unknown NPS record sync failure.',
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

function buildQuery(body: SyncRequestBody, start: number, limit: number): NpsCampgroundsQuery {
  return {
    baseUrl: NPS_BASE_URL,
    limit,
    start,
    parkCode: typeof body.parkCode === 'string' && body.parkCode.trim() ? body.parkCode.trim() : undefined,
    stateCode: typeof body.stateCode === 'string' && body.stateCode.trim() ? body.stateCode.trim() : undefined,
    query: typeof body.query === 'string' && body.query.trim() ? body.query.trim() : undefined,
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function appendApiKey(url: string, apiKey: string): string {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set('api_key', apiKey);
  return nextUrl.toString();
}

async function fetchNpsJson<T extends Record<string, unknown>>(url: string, apiKey: string, attempt = 0): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(appendApiKey(url, apiKey), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : RATE_LIMIT_RETRY_MS);
        return fetchNpsJson<T>(url, apiKey, attempt + 1);
      }

      const providerError = npsProviderError(response.status, body);
      throw new Error(`${providerError.code}: ${providerError.message}`);
    }

    if (!body || typeof body !== 'object') {
      throw new Error('NPS_PROVIDER_ERROR: NPS returned malformed JSON.');
    }

    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function getNpsAttribution(): Promise<string> {
  const { data } = await admin
    .from('campground_provider_configs')
    .select('attribution_text')
    .eq('provider_id', 'nps')
    .maybeSingle();

  const attribution = typeof data?.attribution_text === 'string' ? data.attribution_text.trim() : '';
  return attribution || 'National Park Service';
}

async function createSyncRun(): Promise<string | null> {
  const { data, error } = await admin
    .from('campground_sync_runs')
    .insert({ provider_id: 'nps', status: 'running' })
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

async function fetchNpsContext(records: NpsCampgroundRecord[], apiKey: string): Promise<Map<string, NpsContext>> {
  const parkCodes = Array.from(new Set(records.map((record) => String(record.parkCode ?? '').trim().toLowerCase()).filter(Boolean)));
  const contextByPark = new Map<string, NpsContext>();
  if (!parkCodes.length) return contextByPark;

  const parksUrl = buildNpsParksUrl(parkCodes, NPS_BASE_URL);
  const alertsUrl = buildNpsAlertsUrl(parkCodes, NPS_BASE_URL);
  const parksPage = parksUrl ? await fetchNpsJson<NpsApiPage<NpsParkRecord>>(parksUrl, apiKey).catch(() => null) : null;
  const alertsPage = alertsUrl ? await fetchNpsJson<NpsApiPage<NpsAlertRecord>>(alertsUrl, apiKey).catch(() => null) : null;

  for (const park of getNpsPageRecords(parksPage ?? {})) {
    const parkCode = String(park.parkCode ?? '').trim().toLowerCase();
    if (!parkCode) continue;
    contextByPark.set(parkCode, { park, alerts: [] });
  }

  for (const alert of getNpsPageRecords(alertsPage ?? {})) {
    const parkCode = String(alert.parkCode ?? '').trim().toLowerCase();
    if (!parkCode) continue;
    const existing = contextByPark.get(parkCode) ?? { park: null, alerts: [] };
    existing.alerts = [...(existing.alerts ?? []), alert];
    contextByPark.set(parkCode, existing);
  }

  return contextByPark;
}

async function findExistingNpsSource(providerRecordId: string): Promise<ExistingNpsSourceRecord | null> {
  const { data } = await admin
    .from('campground_source_records')
    .select('campground_id, first_seen_at')
    .eq('provider_id', 'nps')
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
    .select('id, name, latitude, longitude, managing_agency, managing_org, primary_provider, source_confidence, reservation_url, detail_url, attribution')
    .eq('id', id)
    .maybeSingle();

  return data ? (data as ExistingCampgroundCandidate) : null;
}

async function findNearbyCampgroundMatch(normalized: NormalizedNpsCampground): Promise<ExistingCampgroundCandidate | null> {
  const lat = normalized.campground.latitude;
  const lng = normalized.campground.longitude;
  const delta = 0.02;
  const { data } = await admin
    .from('campgrounds')
    .select('id, name, latitude, longitude, managing_agency, managing_org, primary_provider, source_confidence, reservation_url, detail_url, attribution')
    .gte('latitude', lat - delta)
    .lte('latitude', lat + delta)
    .gte('longitude', lng - delta)
    .lte('longitude', lng + delta)
    .limit(25);

  return selectBestNpsCampgroundMatch(
    normalized,
    Array.isArray(data) ? (data as ExistingCampgroundCandidate[]) : [],
  );
}

async function upsertNpsCampground(normalized: NormalizedNpsCampground, seenAt: string): Promise<'created' | 'enriched'> {
  const existingSource = await findExistingNpsSource(normalized.providerRecordId);
  const existingBySource = existingSource?.campground_id ? await findCampgroundById(existingSource.campground_id) : null;
  const nearbyMatch = existingBySource ?? (await findNearbyCampgroundMatch(normalized));
  let campgroundId = nearbyMatch?.id ?? null;

  if (campgroundId && nearbyMatch) {
    const merged = mergeNpsIntoExistingCampground(nearbyMatch, normalized, seenAt);
    const { error } = await admin.from('campgrounds').update(merged).eq('id', campgroundId);
    if (error) throwWriteError('campground_enrichment', normalized.providerRecordId, error, 'NPS campground enrichment failed.');
  } else {
    const { data, error } = await admin
      .from('campgrounds')
      .insert({ ...normalized.campground, last_synced_at: seenAt })
      .select('id')
      .single();
    if (error) throwWriteError('campground_insert', normalized.providerRecordId, error, 'NPS campground insert failed.');
    if (!data?.id) {
      throwWriteError('campground_insert', normalized.providerRecordId, null, 'NPS campground insert returned no id.');
    }
    campgroundId = String(data.id);
  }

  const rows = buildNpsSyncRows(normalized, campgroundId, existingSource, seenAt);
  const { error: sourceError } = await admin
    .from('campground_source_records')
    .upsert(rows.sourceRecord, { onConflict: 'provider_id,provider_record_id' });
  if (sourceError) {
    throwWriteError('source_record_upsert', normalized.providerRecordId, sourceError, 'NPS source record upsert failed.');
  }

  return nearbyMatch ? 'enriched' : 'created';
}

async function updateProviderLastSynced(): Promise<void> {
  await admin
    .from('campground_provider_configs')
    .update({
      last_synced_at: new Date().toISOString(),
      health_status: 'healthy',
    })
    .eq('provider_id', 'nps');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  const authorization = await requireAdmin(req);
  if (!authorization.ok) return authorization.response;

  const apiKey = getEnvOrNull('NPS_API_KEY');
  if (!apiKey) return jsonResponse({ ok: false, error: 'NPS_API_KEY is not configured' }, 500);

  const body = (await req.json().catch(() => ({}))) as SyncRequestBody;
  const limit = numberParam(body.limit, 50, 1, 50);
  const maxPages = numberParam(body.maxPages, 10, 1, 50);
  let start = numberParam(body.start, 0, 0, 1000000);
  const dryRun = body.dryRun === true;
  const attribution = await getNpsAttribution();
  const syncRunId = dryRun ? null : await createSyncRun();
  const counts: SyncCounts = {
    recordsRead: 0,
    recordsUpserted: 0,
    recordsEnriched: 0,
    recordsFailed: 0,
    errorCount: 0,
    pagesFetched: 0,
  };

  let finalStatus: 'succeeded' | 'partial' | 'failed' = 'succeeded';
  let notes: string | null = null;
  const failureDiagnostics: SyncFailureDiagnostic[] = [];

  try {
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const query = buildQuery(body, start, limit);
      const url = buildNpsCampgroundsUrl(query);
      const page = await fetchNpsJson<NpsApiPage<NpsCampgroundRecord>>(url, apiKey);
      counts.pagesFetched += 1;
      const records = getNpsPageRecords(page);
      counts.recordsRead += records.length;
      const contextByPark = await fetchNpsContext(records, apiKey);

      for (const record of records) {
        const parkCode = String(record.parkCode ?? '').trim().toLowerCase();
        const context = contextByPark.get(parkCode) ?? {};
        const seenAt = new Date().toISOString();
        const normalized = normalizeNpsCampgroundRecord(record, context, { attributionText: attribution, syncedAt: seenAt });
        if (!normalized) {
          counts.recordsFailed += 1;
          addFailureDiagnostic(failureDiagnostics, 'NPS record could not be normalized.');
          continue;
        }

        if (dryRun) {
          counts.recordsUpserted += 1;
          continue;
        }

        try {
          const result = await upsertNpsCampground(normalized, seenAt);
          counts.recordsUpserted += 1;
          if (result === 'enriched') counts.recordsEnriched += 1;
        } catch (_error) {
          counts.recordsFailed += 1;
          counts.errorCount += 1;
          finalStatus = 'partial';
          addFailureDiagnostic(failureDiagnostics, _error, normalized.providerRecordId);
        }
      }

      const nextStart = getNextNpsStart(page, start);
      if (nextStart == null) break;
      start = nextStart;
    }
  } catch (error) {
    counts.errorCount += 1;
    finalStatus = counts.recordsUpserted > 0 ? 'partial' : 'failed';
    notes = error instanceof Error ? error.message : 'NPS sync failed.';
  }

  if (!dryRun && finalStatus !== 'failed') await updateProviderLastSynced();
  if (!notes) notes = firstFailureNote(failureDiagnostics);
  await finishSyncRun(syncRunId, finalStatus, counts, notes);

  return jsonResponse({
    ok: finalStatus !== 'failed',
    providerId: 'nps',
    status: finalStatus,
    dryRun,
    counts,
    notes,
    failureDiagnostics,
  }, finalStatus === 'failed' ? 500 : 200);
});

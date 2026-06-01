/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buildOsmOverpassQuery,
  buildOsmSyncRows,
  getOsmElements,
  mergeOsmIntoExistingCampground,
  normalizeOsmElement,
  osmProviderError,
  selectBestOsmCampgroundMatch,
  validateOsmBbox,
  type ExistingCampgroundCandidate,
  type ExistingOsmSourceRecord,
  type NormalizedOsmCampground,
  type OsmBbox,
  type OsmOverpassResponse,
} from './osmAdapter.ts';

type SyncRequestBody = {
  minLat?: number;
  minLng?: number;
  maxLat?: number;
  maxLng?: number;
  min_lat?: number;
  min_lng?: number;
  max_lat?: number;
  max_lng?: number;
  limit?: number;
  dryRun?: boolean;
};

type SyncCounts = {
  recordsRead: number;
  recordsMatched: number;
  recordsCreated: number;
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

type OsmProviderConfig = {
  attributionText: string;
  overpassUrl: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_OSM_ATTRIBUTION = 'OpenStreetMap contributors';
const REQUEST_TIMEOUT_MS = 20000;
const RATE_LIMIT_RETRY_MS = 3000;
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
    message: sanitizeDiagnosticText(error instanceof Error ? error.message : error) ?? 'Unknown OSM record sync failure.',
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

function requestBbox(body: SyncRequestBody): OsmBbox | null {
  return validateOsmBbox({
    minLat: body.minLat ?? body.min_lat,
    minLng: body.minLng ?? body.min_lng,
    maxLat: body.maxLat ?? body.max_lat,
    maxLng: body.maxLng ?? body.max_lng,
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOsmConfig(): Promise<OsmProviderConfig> {
  const { data } = await admin
    .from('campground_provider_configs')
    .select('attribution_text, base_url')
    .eq('provider_id', 'osm')
    .maybeSingle();

  const configuredBaseUrl = typeof data?.base_url === 'string' && data.base_url.includes('overpass')
    ? data.base_url.trim()
    : null;

  return {
    attributionText:
      getEnvOrNull('OSM_ATTRIBUTION') ??
      (typeof data?.attribution_text === 'string' && data.attribution_text.trim()
        ? data.attribution_text.trim()
        : DEFAULT_OSM_ATTRIBUTION),
    overpassUrl: getEnvOrNull('OSM_OVERPASS_URL') ?? configuredBaseUrl ?? DEFAULT_OVERPASS_URL,
  };
}

async function fetchOverpassPage(
  overpassUrl: string,
  query: string,
  userAgent: string,
  attempt = 0,
): Promise<OsmOverpassResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': userAgent,
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if ((response.status === 429 || response.status === 504) && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : RATE_LIMIT_RETRY_MS);
        return fetchOverpassPage(overpassUrl, query, userAgent, attempt + 1);
      }

      const providerError = osmProviderError(response.status, body);
      throw new Error(`${providerError.code}: ${providerError.message}`);
    }

    if (!body || typeof body !== 'object') {
      throw new Error('OSM_PROVIDER_ERROR: OpenStreetMap Overpass returned malformed JSON.');
    }

    return body as OsmOverpassResponse;
  } finally {
    clearTimeout(timeout);
  }
}

async function createSyncRun(): Promise<string | null> {
  const { data, error } = await admin
    .from('campground_sync_runs')
    .insert({ provider_id: 'osm', status: 'running' })
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

async function findExistingOsmSource(providerRecordId: string): Promise<ExistingOsmSourceRecord | null> {
  const { data } = await admin
    .from('campground_source_records')
    .select('campground_id, first_seen_at')
    .eq('provider_id', 'osm')
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
    .select('id, name, latitude, longitude, facility_type, managing_agency, managing_org, reservation_url, detail_url, status, availability_status, site_count, site_types, amenities, primary_provider, source_confidence, attribution')
    .eq('id', id)
    .maybeSingle();
  return data ? (data as ExistingCampgroundCandidate) : null;
}

async function findNearbyCampgroundMatch(normalized: NormalizedOsmCampground): Promise<ExistingCampgroundCandidate | null> {
  const latitude = normalized.campground.latitude;
  const longitude = normalized.campground.longitude;
  const delta = 0.02;

  const { data } = await admin
    .from('campgrounds')
    .select('id, name, latitude, longitude, facility_type, managing_agency, managing_org, reservation_url, detail_url, status, availability_status, site_count, site_types, amenities, primary_provider, source_confidence, attribution')
    .gte('latitude', latitude - delta)
    .lte('latitude', latitude + delta)
    .gte('longitude', longitude - delta)
    .lte('longitude', longitude + delta)
    .limit(30);

  return selectBestOsmCampgroundMatch(normalized, Array.isArray(data) ? (data as ExistingCampgroundCandidate[]) : []);
}

async function upsertOsmCampground(normalized: NormalizedOsmCampground, seenAt: string): Promise<'created' | 'matched'> {
  const existingSource = await findExistingOsmSource(normalized.providerRecordId);
  let campgroundId = existingSource?.campground_id ?? null;
  let matched = false;

  if (campgroundId) {
    const existing = await findCampgroundById(campgroundId);
    const campground = existing
      ? mergeOsmIntoExistingCampground(existing, normalized, seenAt)
      : { ...normalized.campground, last_synced_at: seenAt };
    const { error } = await admin.from('campgrounds').update(campground).eq('id', campgroundId);
    if (error) throwWriteError('campground_update', normalized.providerRecordId, error, 'OSM campground update failed.');
    matched = true;
  } else {
    const candidate = await findNearbyCampgroundMatch(normalized);
    if (candidate?.id) {
      campgroundId = candidate.id;
      const campground = mergeOsmIntoExistingCampground(candidate, normalized, seenAt);
      const { error } = await admin.from('campgrounds').update(campground).eq('id', campgroundId);
      if (error) throwWriteError('campground_merge', normalized.providerRecordId, error, 'OSM campground merge failed.');
      matched = true;
    } else {
      const { data, error } = await admin
        .from('campgrounds')
        .insert({
          ...normalized.campground,
          last_synced_at: seenAt,
          status: 'unknown',
          availability_status: 'unknown',
        })
        .select('id')
        .single();
      if (error) throwWriteError('campground_insert', normalized.providerRecordId, error, 'OSM campground insert failed.');
      if (!data?.id) {
        throwWriteError('campground_insert', normalized.providerRecordId, null, 'OSM campground insert returned no id.');
      }
      campgroundId = String(data.id);
    }
  }

  const rows = buildOsmSyncRows(normalized, campgroundId, existingSource, seenAt);
  const { error: sourceError } = await admin
    .from('campground_source_records')
    .upsert(rows.sourceRecord, { onConflict: 'provider_id,provider_record_id' });
  if (sourceError) {
    throwWriteError('source_record_upsert', normalized.providerRecordId, sourceError, 'OSM source record upsert failed.');
  }

  return matched ? 'matched' : 'created';
}

async function updateProviderLastSynced(): Promise<void> {
  await admin
    .from('campground_provider_configs')
    .update({
      last_synced_at: new Date().toISOString(),
      health_status: 'healthy',
    })
    .eq('provider_id', 'osm');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  const authorization = await requireAdmin(req);
  if (!authorization.ok) return authorization.response;

  const userAgent = getEnvOrNull('OSM_USER_AGENT');
  if (!userAgent) return jsonResponse({ ok: false, error: 'OSM_USER_AGENT is not configured' }, 500);

  const body = (await req.json().catch(() => ({}))) as SyncRequestBody;
  const bbox = requestBbox(body);
  if (!bbox) {
    return jsonResponse({
      ok: false,
      error: 'A valid bounded bbox is required: minLat, minLng, maxLat, maxLng.',
    }, 400);
  }

  const limit = numberParam(body.limit, 500, 1, 1000);
  const dryRun = body.dryRun === true;
  const config = await getOsmConfig();
  const syncRunId = dryRun ? null : await createSyncRun();
  const counts: SyncCounts = {
    recordsRead: 0,
    recordsMatched: 0,
    recordsCreated: 0,
    recordsUpserted: 0,
    recordsFailed: 0,
    errorCount: 0,
    pagesFetched: 0,
  };

  let finalStatus: 'succeeded' | 'partial' | 'failed' = 'succeeded';
  let notes: string | null = null;
  const failureDiagnostics: SyncFailureDiagnostic[] = [];

  try {
    const page = await fetchOverpassPage(config.overpassUrl, buildOsmOverpassQuery(bbox), userAgent);
    counts.pagesFetched = 1;
    const elements = getOsmElements(page).slice(0, limit);
    counts.recordsRead = elements.length;

    for (const element of elements) {
      const seenAt = new Date().toISOString();
      const normalized = normalizeOsmElement(element, {
        attributionText: config.attributionText,
        syncedAt: seenAt,
      });
      if (!normalized) {
        counts.recordsFailed += 1;
        addFailureDiagnostic(failureDiagnostics, 'OSM record could not be normalized.');
        continue;
      }

      if (dryRun) {
        counts.recordsUpserted += 1;
        continue;
      }

      try {
        const result = await upsertOsmCampground(normalized, seenAt);
        if (result === 'matched') counts.recordsMatched += 1;
        if (result === 'created') counts.recordsCreated += 1;
        counts.recordsUpserted += 1;
      } catch (_error) {
        counts.recordsFailed += 1;
        counts.errorCount += 1;
        finalStatus = 'partial';
        addFailureDiagnostic(failureDiagnostics, _error, normalized.providerRecordId);
      }
    }
  } catch (error) {
    counts.errorCount += 1;
    finalStatus = counts.recordsUpserted > 0 ? 'partial' : 'failed';
    notes = error instanceof Error ? error.message : 'OSM sync failed.';
  }

  if (!dryRun && finalStatus !== 'failed') await updateProviderLastSynced();
  if (!notes) notes = firstFailureNote(failureDiagnostics);
  await finishSyncRun(syncRunId, finalStatus, counts, notes);

  return jsonResponse({
    ok: finalStatus !== 'failed',
    providerId: 'osm',
    status: finalStatus,
    dryRun,
    bbox,
    counts,
    notes,
    failureDiagnostics,
  }, finalStatus === 'failed' ? 500 : 200);
});

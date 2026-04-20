/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type IssueAction = 'ingest_issue_event' | 'get_issue_summary';

type IssueEvent = {
  id?: string;
  occurredAt?: string | null;
  eventType?: string | null;
  severity?: string | null;
  issueTitle?: string | null;
  issueSignature?: string | null;
  normalizedSignature?: string | null;
  ecsArea?: string | null;
  message?: string | null;
  sourceKind?: string | null;
  hashedUserId?: string | null;
  hashedSessionId?: string | null;
  runtimeContext?: Record<string, Json> | null;
  metadata?: Record<string, Json> | null;
};

type RequestBody = {
  action?: IssueAction | string;
  events?: IssueEvent[];
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
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

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function toJson(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJson(item));
  if (typeof value === 'object') {
    const record: Record<string, Json> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      record[key] = toJson(nested);
    }
    return record;
  }
  return String(value);
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map((part) => Number(part));
  const bParts = b.split('.').map((part) => Number(part));
  const length = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < length; index += 1) {
    const left = Number.isFinite(aParts[index]) ? aParts[index] : 0;
    const right = Number.isFinite(bParts[index]) ? bParts[index] : 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

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

function normalizeEvent(event: IssueEvent) {
  return {
    occurred_at: safeString(event.occurredAt, new Date().toISOString()),
    event_type: safeString(event.eventType, 'non_fatal'),
    severity: safeString(event.severity, 'medium'),
    issue_title: safeString(event.issueTitle, 'Unnamed ECS issue'),
    issue_signature: safeString(event.issueSignature, 'unknown'),
    normalized_signature: safeString(event.normalizedSignature, 'unknown'),
    ecs_area: safeString(event.ecsArea, 'unknown'),
    message: safeString(event.message, ''),
    source_kind: safeString(event.sourceKind, 'runtime'),
    hashed_user_id: safeString(event.hashedUserId, '') || null,
    hashed_session_id: safeString(event.hashedSessionId, '') || null,
    app_version: safeString((event.runtimeContext as any)?.appVersion, '') || null,
    platform: safeString((event.runtimeContext as any)?.platform, '') || null,
    environment: safeString((event.runtimeContext as any)?.environment, '') || null,
    runtime_context: toJson(event.runtimeContext ?? {}),
    metadata: toJson(event.metadata ?? {}),
  };
}

function buildGroupSummary(rows: any[]) {
  const grouped = new Map<string, any[]>();
  rows.forEach((row) => {
    const key = String(row.normalized_signature || 'unknown');
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  });

  const versions = Array.from(
    new Set(
      rows
        .map((row) => safeString(row.app_version, ''))
        .filter(Boolean),
    ),
  ).sort(compareVersions);
  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const currentStart = now - sevenDaysMs;
  const previousStart = currentStart - sevenDaysMs;

  const groups = Array.from(grouped.entries())
    .map(([signature, events]) => {
      const sorted = [...events].sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
      const latest = sorted[sorted.length - 1];
      const currentCount = events.filter((event) => new Date(event.received_at).getTime() >= currentStart).length;
      const previousCount = events.filter((event) => {
        const ts = new Date(event.received_at).getTime();
        return ts >= previousStart && ts < currentStart;
      }).length;

      let trendDirection: 'up' | 'down' | 'flat' | 'new' | 'quieted' = 'flat';
      if (previousCount === 0 && currentCount > 0) trendDirection = 'new';
      else if (currentCount === 0 && previousCount > 0) trendDirection = 'quieted';
      else if (currentCount > previousCount) trendDirection = 'up';
      else if (currentCount < previousCount) trendDirection = 'down';

      const versionSet = Array.from(
        new Set(events.map((event) => safeString(event.app_version, '')).filter(Boolean)),
      ).sort(compareVersions);
      const firstSeenVersion = safeString(sorted[0]?.app_version, '') || null;

      const topContext = latest.runtime_context ?? {};
      return {
        signature,
        title: safeString(latest.issue_title, 'Unnamed ECS issue'),
        issueType: safeString(latest.event_type, 'non_fatal'),
        severity: safeString(latest.severity, 'medium'),
        ecsArea: safeString(latest.ecs_area, 'unknown'),
        appVersionsAffected: versionSet,
        usersImpactedCount: new Set(events.map((event) => event.hashed_user_id).filter(Boolean)).size,
        sessionsImpactedCount: new Set(events.map((event) => event.hashed_session_id).filter(Boolean)).size,
        eventCount: events.length,
        firstSeen: sorted[0]?.received_at,
        lastSeen: latest.received_at,
        trendDirection,
        releaseRegression: Boolean(latestVersion && firstSeenVersion && compareVersions(firstSeenVersion, latestVersion) === 0),
        topContextTags: {
          activeTab: safeString(topContext.activeTab, '') || null,
          routeState: safeString(topContext.routeState, '') || null,
          gpsState: safeString(topContext.gpsState, '') || null,
          bluetoothTelemetryState: safeString(topContext.bluetoothTelemetryState, '') || null,
          offlineReadiness: safeString(topContext.offlineReadiness, '') || null,
          weatherStatus: safeString(topContext.weatherStatus, '') || null,
          fallbackUsed:
            typeof topContext.fallbackUsed === 'boolean' ? String(topContext.fallbackUsed) : null,
        },
      };
    })
    .sort((a, b) => {
      const severityOrder = ['critical', 'high', 'medium', 'low'];
      const severityDelta = severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
      if (severityDelta !== 0) return severityDelta;
      return b.eventCount - a.eventCount;
    });

  return {
    latestVersion,
    groups,
    frequentIssues: groups.slice().sort((a, b) => b.eventCount - a.eventCount).slice(0, 8),
    newSinceLatestRelease: groups.filter((group) => group.releaseRegression).slice(0, 8),
    regressions: groups.filter((group) => group.releaseRegression && (group.trendDirection === 'up' || group.trendDirection === 'new')).slice(0, 8),
    trendingUp: groups.filter((group) => group.trendDirection === 'up' || group.trendDirection === 'new').slice(0, 8),
    trendingDown: groups.filter((group) => group.trendDirection === 'down').slice(0, 8),
    resolvedOrQuieted: groups.filter((group) => group.trendDirection === 'quieted' || group.trendDirection === 'down').slice(0, 8),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const action = String(body.action ?? '');

    if (action === 'ingest_issue_event') {
      const events = Array.isArray(body.events) ? body.events : [];
      if (!events.length) {
        return jsonResponse({ ok: true, inserted: 0 });
      }

      const normalizedEvents = events.map(normalizeEvent);
      const { error } = await admin.from('ecs_issue_events').insert(normalizedEvents);
      if (error) {
        return jsonResponse({ ok: false, error: error.message }, 500);
      }
      return jsonResponse({ ok: true, inserted: normalizedEvents.length });
    }

    if (action === 'get_issue_summary') {
      const access = await requireAdmin(req);
      if (!access.ok) return access.response;

      const { data, error } = await admin
        .from('ecs_issue_events')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(4000);

      if (error) {
        return jsonResponse({ ok: false, error: error.message }, 500);
      }

      return jsonResponse({
        ok: true,
        summary: buildGroupSummary(Array.isArray(data) ? data : []),
      });
    }

    return jsonResponse({ ok: false, error: 'Unsupported issue intelligence action' }, 400);
  } catch (error: any) {
    return jsonResponse({ ok: false, error: error?.message || 'Unexpected issue intelligence failure' }, 500);
  }
});

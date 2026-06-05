/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ecs-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const MAX_GROUPS = 50;
const MAX_ROUTES = 300;
const MAX_EDGES = 500;
const ROUTE_SOURCE_PROVIDER_ID = 'route_catalog_stitch_groups';
const ROUTE_SOURCE_URI = 'route_catalog_stitchability_review_queue';

type JsonRecord = Record<string, unknown>;

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

function requireSyncToken(req: Request): Response | null {
  const expected = Deno.env.get('ECS_ROUTE_CATALOG_SYNC_TOKEN');
  const provided = req.headers.get('x-ecs-sync-token');
  if (!expected || !provided || provided !== expected) {
    return jsonResponse({ ok: false, error: 'Route catalog sync token required' }, 401);
  }
  return null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function readText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readBooleanFalse(value: unknown): boolean {
  return value === false;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean),
  ));
}

function readEndpoint(value: unknown): { latitude: number; longitude: number } {
  const record = readRecord(value);
  const latitude = readNumber(record?.latitude, Number.NaN);
  const longitude = readNumber(record?.longitude, Number.NaN);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    throw new Error('Stitch group edge endpoint is missing a valid latitude/longitude pair.');
  }
  return { latitude, longitude };
}

function chunkRows<T>(rows: T[], size = 100): T[][] {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function planFromBody(body: JsonRecord): JsonRecord {
  return readRecord(body.plan) ?? body;
}

function assertReviewOnlyPlan(body: JsonRecord, plan: JsonRecord) {
  if (body.confirmWriteReviewOnly !== true) {
    throw new Error('confirmWriteReviewOnly must be true before writing review-only stitch groups.');
  }
  if (plan.writeEnabled === false) {
    // The writer accepts only the dry-run plan shape; the flag stays false to
    // prevent generated artifacts from implying direct publication authority.
  } else {
    throw new Error('Stitch group writer only accepts dry-run plans with writeEnabled false.');
  }
  if (plan.mode !== 'stitch-group-persistence-dry-run') {
    throw new Error('Stitch group writer requires a stitch-group-persistence-dry-run plan.');
  }

  const groups = Array.isArray(plan.groups) ? plan.groups : [];
  const routes = Array.isArray(plan.routes) ? plan.routes : [];
  const edges = Array.isArray(plan.edges) ? plan.edges : [];
  if (groups.length > MAX_GROUPS || routes.length > MAX_ROUTES || edges.length > MAX_EDGES) {
    throw new Error(`Stitch group plan is too large: max ${MAX_GROUPS} groups, ${MAX_ROUTES} routes, ${MAX_EDGES} edges.`);
  }
}

function validateGroup(group: JsonRecord) {
  const routePublicIds = readStringArray(group.routePublicIds);
  if (!readText(group.publicId)) throw new Error('Stitch group is missing publicId.');
  if (!readText(group.clusterKey)) throw new Error('Stitch group is missing clusterKey.');
  if (routePublicIds.length < 2) throw new Error(`Stitch group ${readText(group.publicId)} must include at least two route IDs.`);
  if (group.publicationStatus !== 'review_only') throw new Error(`Stitch group ${readText(group.publicId)} must stay publicationStatus=review_only.`);
  if (!readBooleanFalse(group.canAutoPublish)) throw new Error(`Stitch group ${readText(group.publicId)} cannot be auto-publishable.`);
  if (group.reviewStatus !== 'draft_review_required') throw new Error(`Stitch group ${readText(group.publicId)} must remain draft_review_required.`);
  if (readNumber(group.chainReadyEdgeCount, 0) < 1) throw new Error(`Stitch group ${readText(group.publicId)} must include at least one chain-ready edge.`);
  if (readNumber(group.bridgeReviewEdgeCount, 0) !== 0) throw new Error(`Stitch group ${readText(group.publicId)} cannot persist bridge-review edges yet.`);
}

function routeSourceUpsert(now: string) {
  return {
    provider_id: ROUTE_SOURCE_PROVIDER_ID,
    name: 'Route Catalog Stitch Groups Review',
    source_type: 'supplemental',
    authority: 'internal_review',
    source_uri: ROUTE_SOURCE_URI,
    attribution: 'ECS route catalog stitchability audit',
    license: 'internal review output',
    refresh_frequency: 'operator-triggered',
    status: 'needs_review',
    last_checked_at: now,
    updated_at: now,
  };
}

async function upsertRouteSource(admin: ReturnType<typeof createAdminClient>, now: string): Promise<string> {
  const { data, error } = await admin
    .from('route_sources')
    .upsert(routeSourceUpsert(now), { onConflict: 'provider_id' })
    .select('id')
    .single();
  if (error || !data?.id) throw new Error(`Unable to upsert stitch group route source: ${error?.message ?? 'no source returned'}`);
  return String(data.id);
}

async function startIngestRun(
  admin: ReturnType<typeof createAdminClient>,
  routeSourceId: string,
  now: string,
  plan: JsonRecord,
): Promise<string> {
  const { data, error } = await admin
    .from('route_source_ingest_runs')
    .insert({
      route_source_id: routeSourceId,
      status: 'running',
      source_uri: ROUTE_SOURCE_URI,
      started_at: now,
      metadata: {
        providerId: ROUTE_SOURCE_PROVIDER_ID,
        mode: plan.mode,
        writeEnabled: plan.writeEnabled,
        groupCount: Array.isArray(plan.groups) ? plan.groups.length : 0,
        routeCount: Array.isArray(plan.routes) ? plan.routes.length : 0,
        edgeCount: Array.isArray(plan.edges) ? plan.edges.length : 0,
        publicRecommendationCount: 0,
      },
    })
    .select('id')
    .single();
  if (error || !data?.id) throw new Error(`Unable to start stitch group ingest run: ${error?.message ?? 'no ingest run returned'}`);
  return String(data.id);
}

function collectRoutePublicIds(plan: JsonRecord): string[] {
  const ids = new Set<string>();
  for (const group of Array.isArray(plan.groups) ? plan.groups : []) {
    for (const routePublicId of readStringArray(readRecord(group)?.routePublicIds)) ids.add(routePublicId);
  }
  for (const route of Array.isArray(plan.routes) ? plan.routes : []) {
    const publicId = readText(readRecord(route)?.routePublicId);
    if (publicId) ids.add(publicId);
  }
  for (const edge of Array.isArray(plan.edges) ? plan.edges : []) {
    const record = readRecord(edge);
    const fromRoutePublicId = readText(record?.fromRoutePublicId);
    const toRoutePublicId = readText(record?.toRoutePublicId);
    if (fromRoutePublicId) ids.add(fromRoutePublicId);
    if (toRoutePublicId) ids.add(toRoutePublicId);
  }
  return [...ids].sort();
}

async function resolveRouteIds(
  admin: ReturnType<typeof createAdminClient>,
  routePublicIds: string[],
): Promise<Map<string, string>> {
  const routeIdByPublicId = new Map<string, string>();
  for (const chunk of chunkRows(routePublicIds)) {
    const { data, error } = await admin
      .from('verified_routes')
      .select('id, public_id')
      .in('public_id', chunk);
    if (error || !Array.isArray(data)) throw new Error(`Unable to resolve verified route IDs: ${error?.message ?? 'no rows returned'}`);
    for (const row of data as Array<JsonRecord>) {
      const publicId = readText(row.public_id);
      const id = readText(row.id);
      if (publicId && id) routeIdByPublicId.set(publicId, id);
    }
  }

  const missing = routePublicIds.filter((publicId) => !routeIdByPublicId.has(publicId));
  if (missing.length > 0) {
    throw new Error(`Stitch group plan references ${missing.length} unknown verified route public IDs: ${missing.slice(0, 8).join(', ')}`);
  }
  return routeIdByPublicId;
}

function groupRowsFromPlan(plan: JsonRecord, now: string): Array<JsonRecord> {
  return (Array.isArray(plan.groups) ? plan.groups : []).map((rawGroup) => {
    const group = readRecord(rawGroup) ?? {};
    validateGroup(group);
    const routePublicIds = readStringArray(group.routePublicIds);
    const metadata = readRecord(group.metadata) ?? {};
    return {
      public_id: readText(group.publicId),
      name: readText(group.name, `${readText(group.clusterLabel, readText(group.clusterKey))} stitch group`),
      cluster_key: readText(group.clusterKey),
      cluster_label: readText(group.clusterLabel) || null,
      source_adapter: readText(group.sourceAdapter, 'unknown'),
      route_public_ids: routePublicIds,
      chain_ready_edge_count: Math.max(1, Math.round(readNumber(group.chainReadyEdgeCount, 1))),
      bridge_review_edge_count: 0,
      review_status: 'draft_review_required',
      publication_status: 'review_only',
      can_auto_publish: false,
      requires_field_review: true,
      metadata: {
        ...metadata,
        writer: 'route-catalog-sync-stitch-groups',
        sourcePlanMode: plan.mode,
      },
      updated_at: now,
    };
  });
}

async function upsertGroupRows(
  admin: ReturnType<typeof createAdminClient>,
  groupRows: Array<JsonRecord>,
): Promise<Map<string, string>> {
  const groupIdByPublicId = new Map<string, string>();
  for (const chunk of chunkRows(groupRows)) {
    const { data, error } = await admin
      .from('route_catalog_stitch_groups')
      .upsert(chunk, { onConflict: 'public_id' })
      .select('id, public_id');
    if (error || !Array.isArray(data)) throw new Error(`Unable to upsert stitch group rows: ${error?.message ?? 'no rows returned'}`);
    for (const row of data as Array<JsonRecord>) {
      const publicId = readText(row.public_id);
      const id = readText(row.id);
      if (publicId && id) groupIdByPublicId.set(publicId, id);
    }
  }
  return groupIdByPublicId;
}

async function clearExistingChildren(admin: ReturnType<typeof createAdminClient>, groupIds: string[]) {
  for (const chunk of chunkRows(groupIds)) {
    const { error: edgeError } = await admin
      .from('route_catalog_stitch_group_edges')
      .delete()
      .in('stitch_group_id', chunk);
    if (edgeError) throw new Error(`Unable to clear stale stitch group edges: ${edgeError.message}`);

    const { error: routeError } = await admin
      .from('route_catalog_stitch_group_routes')
      .delete()
      .in('stitch_group_id', chunk);
    if (routeError) throw new Error(`Unable to clear stale stitch group routes: ${routeError.message}`);
  }
}

function routeRowsFromPlan(
  plan: JsonRecord,
  groupIdByPublicId: Map<string, string>,
  routeIdByPublicId: Map<string, string>,
  now: string,
): Array<JsonRecord> {
  return (Array.isArray(plan.routes) ? plan.routes : []).map((rawRoute) => {
    const route = readRecord(rawRoute) ?? {};
    const stitchGroupPublicId = readText(route.stitchGroupPublicId);
    const routePublicId = readText(route.routePublicId);
    const stitchGroupId = groupIdByPublicId.get(stitchGroupPublicId);
    const verifiedRouteId = routeIdByPublicId.get(routePublicId);
    if (!stitchGroupId || !verifiedRouteId) throw new Error(`Unable to map stitch group route row for ${stitchGroupPublicId}:${routePublicId}.`);
    return {
      stitch_group_id: stitchGroupId,
      verified_route_id: verifiedRouteId,
      route_public_id: routePublicId,
      route_order: Math.max(0, Math.round(readNumber(route.routeOrder, 0))),
      direction: ['forward', 'reverse', 'either', 'unknown'].includes(readText(route.direction))
        ? readText(route.direction)
        : 'unknown',
      metadata: {
        writer: 'route-catalog-sync-stitch-groups',
        verifiedRouteIdResolution: readText(route.verifiedRouteIdResolution, 'resolve_by_route_public_id'),
      },
      updated_at: now,
    };
  });
}

function edgeRowsFromPlan(
  plan: JsonRecord,
  groupIdByPublicId: Map<string, string>,
  now: string,
): Array<JsonRecord> {
  return (Array.isArray(plan.edges) ? plan.edges : []).map((rawEdge) => {
    const edge = readRecord(rawEdge) ?? {};
    if (edge.edgeStatus !== 'chain_ready') {
      throw new Error('Stitch group writer only persists chain-ready source joins.');
    }
    if (edge.requiresVerifiedBridge === true) {
      throw new Error('Stitch group writer will not persist bridge-review gaps until connector geometry has been deterministically verified.');
    }
    const stitchGroupPublicId = readText(edge.stitchGroupPublicId);
    const stitchGroupId = groupIdByPublicId.get(stitchGroupPublicId);
    if (!stitchGroupId) throw new Error(`Unable to map stitch group edge row for ${stitchGroupPublicId}.`);
    const fromRoutePublicId = readText(edge.fromRoutePublicId);
    const toRoutePublicId = readText(edge.toRoutePublicId);
    if (!fromRoutePublicId || !toRoutePublicId) throw new Error(`Stitch group ${stitchGroupPublicId} edge is missing route public IDs.`);
    const gapMeters = readNumber(edge.gapMeters, 0);
    if (gapMeters < 0) throw new Error(`Stitch group ${stitchGroupPublicId} edge has a negative gap.`);
    return {
      stitch_group_id: stitchGroupId,
      from_route_public_id: fromRoutePublicId,
      to_route_public_id: toRoutePublicId,
      edge_status: 'chain_ready',
      gap_meters: Number(gapMeters.toFixed(1)),
      from_endpoint: readEndpoint(edge.fromEndpoint),
      to_endpoint: readEndpoint(edge.toEndpoint),
      requires_verified_bridge: false,
      review_status: 'draft_review_required',
      metadata: {
        writer: 'route-catalog-sync-stitch-groups',
        sourcePlanMode: plan.mode,
      },
      updated_at: now,
    };
  });
}

async function upsertChildRows(admin: ReturnType<typeof createAdminClient>, tableName: string, rows: Array<JsonRecord>, onConflict: string) {
  for (const chunk of chunkRows(rows)) {
    const { error } = await admin
      .from(tableName)
      .upsert(chunk, { onConflict });
    if (error) throw new Error(`Unable to upsert ${tableName}: ${error.message}`);
  }
}

async function finishIngestRun(
  admin: ReturnType<typeof createAdminClient>,
  ingestRunId: string,
  status: 'succeeded' | 'failed',
  counts: { groupCount: number; routeCount: number; edgeCount: number },
  errorMessage = '',
) {
  await admin
    .from('route_source_ingest_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      raw_feature_count: counts.routeCount + counts.edgeCount,
      normalized_feature_count: counts.groupCount,
      error_message: errorMessage || null,
      metadata: {
        providerId: ROUTE_SOURCE_PROVIDER_ID,
        groupCount: counts.groupCount,
        routeCount: counts.routeCount,
        edgeCount: counts.edgeCount,
        publicRecommendationCount: 0,
        publicationStatus: 'review_only',
      },
    })
    .eq('id', ingestRunId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  const tokenFailure = requireSyncToken(req);
  if (tokenFailure) return tokenFailure;

  let admin: ReturnType<typeof createAdminClient> | null = null;
  let ingestRunId = '';
  let counts = { groupCount: 0, routeCount: 0, edgeCount: 0 };

  try {
    admin = createAdminClient();
    const body = (await req.json().catch(() => ({}))) as JsonRecord;
    const plan = planFromBody(body);
    assertReviewOnlyPlan(body, plan);

    const now = new Date().toISOString();
    counts = {
      groupCount: Array.isArray(plan.groups) ? plan.groups.length : 0,
      routeCount: Array.isArray(plan.routes) ? plan.routes.length : 0,
      edgeCount: Array.isArray(plan.edges) ? plan.edges.length : 0,
    };

    const routeSourceId = await upsertRouteSource(admin, now);
    ingestRunId = await startIngestRun(admin, routeSourceId, now, plan);

    const routePublicIds = collectRoutePublicIds(plan);
    const routeIdByPublicId = await resolveRouteIds(admin, routePublicIds);
    const groupRows = groupRowsFromPlan(plan, now);
    const groupIdByPublicId = await upsertGroupRows(admin, groupRows);
    await clearExistingChildren(admin, [...groupIdByPublicId.values()]);

    const routeRows = routeRowsFromPlan(plan, groupIdByPublicId, routeIdByPublicId, now);
    const edgeRows = edgeRowsFromPlan(plan, groupIdByPublicId, now);
    await upsertChildRows(
      admin,
      'route_catalog_stitch_group_routes',
      routeRows,
      'stitch_group_id,route_public_id',
    );
    await upsertChildRows(
      admin,
      'route_catalog_stitch_group_edges',
      edgeRows,
      'stitch_group_id,from_route_public_id,to_route_public_id',
    );

    await finishIngestRun(admin, ingestRunId, 'succeeded', counts);

    return jsonResponse({
      ok: true,
      source: ROUTE_SOURCE_PROVIDER_ID,
      groupCount: counts.groupCount,
      routeCount: counts.routeCount,
      edgeCount: counts.edgeCount,
      publicRecommendationCount: 0,
      publicationStatus: 'review_only',
      caveat:
        'Stitch groups are review-only operator drafts. They do not create connector geometry, legal access, or public route recommendations.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stitch group sync failed.';
    if (admin && ingestRunId) {
      await finishIngestRun(admin, ingestRunId, 'failed', counts, message).catch(() => {});
    }
    console.error('[route-catalog-sync-stitch-groups]', { message });
    return jsonResponse({
      ok: false,
      error: message,
      publicRecommendationCount: 0,
    }, 500);
  }
});

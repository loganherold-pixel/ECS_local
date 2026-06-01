/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  NPS_PUBLIC_TRAILS_LAYER,
  arcGisFeatureToNpsPublicTrailsRouteUpsert,
  buildNpsPublicTrailsWhereClause,
  normalizeNpsPublicTrailsBbox,
  normalizeNpsPublicTrailsFeatureCollection,
  npsPublicTrailsSourceUpsert,
  type NpsPublicTrailsBbox,
} from '../_shared/routeCatalogNpsPublicTrails.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ecs-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function requireSyncToken(req: Request): Response | null {
  const expected = Deno.env.get('ECS_ROUTE_CATALOG_SYNC_TOKEN');
  const provided = req.headers.get('x-ecs-sync-token');
  if (!expected || !provided || provided !== expected) {
    return jsonResponse({ ok: false, error: 'Route catalog sync token required' }, 401);
  }
  return null;
}

function readNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function chunkRows<T>(rows: T[], size = 100): T[][] {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function routePublicId(row: Record<string, unknown>): string {
  return String(row.public_id ?? '').trim();
}

function buildRouteIdByPublicId(rows: Array<Record<string, unknown>>): Map<string, string> {
  const routeIdByPublicId = new Map<string, string>();
  rows.forEach((row) => {
    const publicId = routePublicId(row);
    const id = typeof row.id === 'string' ? row.id : '';
    if (publicId && id) routeIdByPublicId.set(publicId, id);
  });
  return routeIdByPublicId;
}

async function upsertRawFeatureRows(
  admin: ReturnType<typeof createAdminClient>,
  rawFeatureRows: Array<Record<string, unknown>>,
) {
  for (const chunk of chunkRows(rawFeatureRows)) {
    const { error } = await admin
      .from('route_raw_source_features')
      .upsert(chunk, { onConflict: 'route_source_id,provider_feature_id,source_layer' });
    if (error) throw new Error('Unable to batch upsert NPS public trails raw source features.');
  }
}

async function upsertRouteRows(
  admin: ReturnType<typeof createAdminClient>,
  routeRows: Array<Record<string, unknown>>,
): Promise<Map<string, string>> {
  const allRows = [];
  for (const chunk of chunkRows(routeRows)) {
    const { data, error } = await admin
      .from('verified_routes')
      .upsert(chunk, { onConflict: 'public_id' })
      .select('id, public_id');
    if (error || !Array.isArray(data)) throw new Error('Unable to batch upsert NPS public trails route rows.');
    allRows.push(...data);
  }
  return buildRouteIdByPublicId(allRows as Array<Record<string, unknown>>);
}

async function upsertRouteSourceRows(
  admin: ReturnType<typeof createAdminClient>,
  sourceRefs: Array<{ publicId: string; source: Record<string, unknown> }>,
  routeIdByPublicId: Map<string, string>,
) {
  const sourceRows = sourceRefs
    .map((ref) => {
      const verifiedRouteId = routeIdByPublicId.get(ref.publicId);
      return verifiedRouteId
        ? { ...ref.source, verified_route_id: verifiedRouteId }
        : null;
    })
    .filter((row): row is Record<string, unknown> => !!row);

  if (sourceRows.length !== sourceRefs.length) {
    throw new Error('Unable to map all NPS public trails route source rows to route IDs.');
  }

  for (const chunk of chunkRows(sourceRows)) {
    const { error } = await admin
      .from('verified_route_sources')
      .upsert(chunk, { onConflict: 'verified_route_id,route_source_id,source_role' });
    if (error) throw new Error('Unable to batch upsert NPS public trails route source rows.');
  }
}

async function fetchTrailFeatures(bbox: NpsPublicTrailsBbox, limit: number) {
  const records = [];
  const pageSize = Math.min(1000, Math.max(1, limit));
  let offset = 0;

  while (records.length < limit) {
    const params = new URLSearchParams({
      f: 'json',
      where: buildNpsPublicTrailsWhereClause(),
      outFields: [
        'OBJECTID',
        'TRLNAME',
        'TRLALTNAME',
        'MAPLABEL',
        'TRLSTATUS',
        'TRLSURFACE',
        'TRLTYPE',
        'TRLCLASS',
        'TRLUSE',
        'PUBLICDISPLAY',
        'DATAACCESS',
        'ACCESSNOTES',
        'ORIGINATOR',
        'UNITCODE',
        'UNITNAME',
        'UNITTYPE',
        'GROUPCODE',
        'GROUPNAME',
        'REGIONCODE',
        'SOURCEDATE',
        'FEATUREID',
        'GEOMETRYID',
        'OPENTOPUBLIC',
        'SEASONAL',
        'SEASDESC',
        'MAINTAINER',
        'NOTES',
      ].join(','),
      returnGeometry: 'true',
      outSR: '4326',
      geometryPrecision: '6',
      geometry: JSON.stringify(bbox),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      resultOffset: String(offset),
      resultRecordCount: String(Math.min(pageSize, limit - records.length)),
    });

    const response = await fetch(`${NPS_PUBLIC_TRAILS_LAYER.url}/query?${params.toString()}`);
    if (!response.ok) throw new Error('NPS public trails query failed');
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(`NPS public trails query error: ${payload.error.message ?? 'ArcGIS query failed'}`);
    }
    const page = normalizeNpsPublicTrailsFeatureCollection(payload);
    records.push(...page);
    if (page.length < pageSize || payload.exceededTransferLimit !== true) break;
    offset += page.length;
  }

  return records.slice(0, limit);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  const tokenFailure = requireSyncToken(req);
  if (tokenFailure) return tokenFailure;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const bbox = normalizeNpsPublicTrailsBbox(body.bbox);
    if (!bbox) return jsonResponse({ ok: false, error: 'Valid bbox is required for bounded NPS public trails sync' }, 400);
    const minMiles = Math.max(0.1, readNumber(body.minMiles ?? body.min_miles, 0.1));
    const limit = Math.max(1, Math.min(500, Math.round(readNumber(body.limit ?? body.limit_per_bbox, 150))));
    const now = new Date().toISOString();
    const admin = createAdminClient();

    const { data: source, error: sourceError } = await admin
      .from('route_sources')
      .upsert(npsPublicTrailsSourceUpsert(now), { onConflict: 'provider_id' })
      .select('id')
      .single();
    if (sourceError || !source) throw new Error('Unable to upsert NPS public trails route source');

    const { data: ingestRun, error: ingestError } = await admin
      .from('route_source_ingest_runs')
      .insert({
        route_source_id: source.id,
        status: 'running',
        source_uri: NPS_PUBLIC_TRAILS_LAYER.url,
        started_at: now,
        metadata: { providerId: 'nps_public_trails', bbox, minMiles, limit },
      })
      .select('id')
      .single();
    if (ingestError || !ingestRun) throw new Error('Unable to start NPS public trails ingest run');

    const features = await fetchTrailFeatures(bbox, limit);
    const rawFeatureRows: Array<Record<string, unknown>> = [];
    const routeRows: Array<Record<string, unknown>> = [];
    const sourceRefs: Array<{ publicId: string; source: Record<string, unknown> }> = [];

    for (const feature of features) {
      const upsert = arcGisFeatureToNpsPublicTrailsRouteUpsert(feature, {
        sourceId: source.id,
        sourceLastVerifiedAt: now,
        ingestRunId: ingestRun.id,
        minMiles,
      });
      if (!upsert) continue;

      rawFeatureRows.push(upsert.rawSourceFeature);
      routeRows.push(upsert.verifiedRoute);
      sourceRefs.push({
        publicId: routePublicId(upsert.verifiedRoute),
        source: upsert.verifiedRouteSource,
      });
    }

    await upsertRawFeatureRows(admin, rawFeatureRows);
    const routeIdByPublicId = await upsertRouteRows(admin, routeRows);
    await upsertRouteSourceRows(admin, sourceRefs, routeIdByPublicId);

    await admin
      .from('route_source_ingest_runs')
      .update({
        status: 'succeeded',
        finished_at: new Date().toISOString(),
        raw_feature_count: features.length,
        normalized_feature_count: routeRows.length,
        metadata: { providerId: 'nps_public_trails', bbox, minMiles, limit, publicRecommendationCount: 0 },
      })
      .eq('id', ingestRun.id);

    return jsonResponse({
      ok: true,
      source: 'nps_public_trails',
      bbox,
      rawFeatureCount: features.length,
      normalizedFeatureCount: routeRows.length,
      publicRecommendationCount: 0,
      caveat: 'NPS public trails records are official park-context curation inputs only. They do not become public Suggested Routes unless park-unit legal access, current alerts, closures, and ECS route curation pass.',
    });
  } catch (error) {
    console.error('[route-catalog-sync-nps-trails]', {
      message: error instanceof Error ? error.message : 'Unknown NPS public trails sync failure.',
    });
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'NPS public trails sync failed.',
    }, 500);
  }
});

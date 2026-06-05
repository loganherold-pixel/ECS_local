/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  ARIZONA_STATE_PARKS_TRAILS_QUERY,
  ARIZONA_STATE_PARKS_TRAILS_SOURCE,
  arizonaStateParksTrailsSourceUpsert,
  featureToArizonaStateParksTrailRouteUpsert,
  normalizeArizonaStateParksTrailFeatureCollection,
} from '../_shared/routeCatalogArizonaStateParksTrails.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ecs-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const GEOMETRY_BATCH_SIZE = 25;

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

function chunkRows<T>(rows: T[], size = GEOMETRY_BATCH_SIZE): T[][] {
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

function countPublicRecommendations(routeRows: Array<Record<string, unknown>>): number {
  return routeRows.filter((row) => row.recommendation_status === 'recommendable').length;
}

async function upsertRawFeatureRows(
  admin: ReturnType<typeof createAdminClient>,
  rawFeatureRows: Array<Record<string, unknown>>,
) {
  for (const chunk of chunkRows(rawFeatureRows)) {
    const { error } = await admin
      .from('route_raw_source_features')
      .upsert(chunk, { onConflict: 'route_source_id,provider_feature_id,source_layer' });
    if (error) throw new Error(`Unable to batch upsert Arizona trail raw source features: ${error.message}`);
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
    if (error) throw new Error(`Unable to batch upsert Arizona trail route rows: ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Unable to batch upsert Arizona trail route rows: no rows returned.');
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
    throw new Error('Unable to map all Arizona trail route source rows to route IDs.');
  }

  for (const chunk of chunkRows(sourceRows)) {
    const { error } = await admin
      .from('verified_route_sources')
      .upsert(chunk, { onConflict: 'verified_route_id,route_source_id,source_role' });
    if (error) throw new Error(`Unable to batch upsert Arizona trail route source rows: ${error.message}`);
  }
}

async function fetchArizonaTrailFeatures(maxFeatures: number): Promise<unknown> {
  const queryUrl = new URL(`${ARIZONA_STATE_PARKS_TRAILS_SOURCE.sourceUri}/query`);
  queryUrl.searchParams.set('f', 'json');
  queryUrl.searchParams.set('where', ARIZONA_STATE_PARKS_TRAILS_QUERY.where);
  queryUrl.searchParams.set('outFields', ARIZONA_STATE_PARKS_TRAILS_QUERY.outFields);
  queryUrl.searchParams.set('returnGeometry', 'true');
  queryUrl.searchParams.set('outSR', String(ARIZONA_STATE_PARKS_TRAILS_QUERY.outSR));
  queryUrl.searchParams.set('geometryPrecision', '6');
  queryUrl.searchParams.set('orderByFields', 'FID');
  queryUrl.searchParams.set('resultRecordCount', String(maxFeatures));

  const response = await fetch(queryUrl.toString());
  if (!response.ok) {
    throw new Error(`Arizona State Parks trails query failed: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload?.error?.message) {
    throw new Error(`Arizona State Parks trails query failed: ${payload.error.message}`);
  }
  return payload;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  const tokenFailure = requireSyncToken(req);
  if (tokenFailure) return tokenFailure;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const minMiles = Math.max(0.1, readNumber(body.minMiles ?? body.min_miles, 0.25));
    const maxFeatures = Math.max(1, Math.min(1000, Math.round(readNumber(body.maxFeatures ?? body.max_features, 250))));
    const now = new Date().toISOString();
    const admin = createAdminClient();

    const { data: source, error: sourceError } = await admin
      .from('route_sources')
      .upsert(arizonaStateParksTrailsSourceUpsert(now), { onConflict: 'provider_id' })
      .select('id')
      .single();
    if (sourceError) throw new Error(`Unable to upsert Arizona trail route source: ${sourceError.message}`);
    if (!source) throw new Error('Unable to upsert Arizona trail route source: no source returned');

    const { data: ingestRun, error: ingestError } = await admin
      .from('route_source_ingest_runs')
      .insert({
        route_source_id: source.id,
        status: 'running',
        source_uri: ARIZONA_STATE_PARKS_TRAILS_SOURCE.sourceUri,
        started_at: now,
        metadata: {
          providerId: 'arizona_state_parks_trails',
          query: ARIZONA_STATE_PARKS_TRAILS_QUERY,
          minMiles,
          maxFeatures,
        },
      })
      .select('id')
      .single();
    if (ingestError) throw new Error(`Unable to start Arizona trail ingest run: ${ingestError.message}`);
    if (!ingestRun) throw new Error('Unable to start Arizona trail ingest run: no ingest run returned');

    const payload = await fetchArizonaTrailFeatures(maxFeatures);
    const features = normalizeArizonaStateParksTrailFeatureCollection(payload);
    const rawFeatureRows: Array<Record<string, unknown>> = [];
    const routeRows: Array<Record<string, unknown>> = [];
    const sourceRefs: Array<{ publicId: string; source: Record<string, unknown> }> = [];

    for (const feature of features) {
      const upsert = featureToArizonaStateParksTrailRouteUpsert(feature, {
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
    const publicRecommendationCount = countPublicRecommendations(routeRows);

    await admin
      .from('route_source_ingest_runs')
      .update({
        status: 'succeeded',
        finished_at: new Date().toISOString(),
        raw_feature_count: features.length,
        normalized_feature_count: routeRows.length,
        metadata: {
          providerId: 'arizona_state_parks_trails',
          query: ARIZONA_STATE_PARKS_TRAILS_QUERY,
          minMiles,
          maxFeatures,
          sourceFeatures: features.length,
          publicRecommendationCount,
        },
      })
      .eq('id', ingestRun.id);

    return jsonResponse({
      ok: true,
      source: 'arizona_state_parks_trails',
      rawFeatureCount: features.length,
      normalizedFeatureCount: routeRows.length,
      publicRecommendationCount,
      maxFeatures,
      minMiles,
      officialFeatureServerUrl: ARIZONA_STATE_PARKS_TRAILS_SOURCE.sourceUri,
      caveat: 'Arizona State Parks and Trails records are official statewide motorized-use source recommendations with visible warnings. Current closures, permits, local signage, land ownership, weather, fire restrictions, and vehicle-class suitability still require trip-date checks.',
    });
  } catch (error) {
    console.error('[route-catalog-sync-arizona-trails]', {
      message: error instanceof Error ? error.message : 'Unknown Arizona trail sync failure.',
    });
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Arizona trail sync failed.',
    }, 500);
  }
});

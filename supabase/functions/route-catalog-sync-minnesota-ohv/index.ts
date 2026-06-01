/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  MINNESOTA_OHV_DOWNLOADS,
  MINNESOTA_OHV_SOURCE,
  featureToMinnesotaOhvRouteUpsert,
  minnesotaOhvSourceUpsert,
  normalizeMinnesotaOhvFeatureCollection,
} from '../_shared/routeCatalogMinnesotaOhv.ts';

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
    if (error) throw new Error('Unable to batch upsert Minnesota DNR OHV raw source features.');
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
    if (error || !Array.isArray(data)) throw new Error('Unable to batch upsert Minnesota DNR OHV route rows.');
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
    throw new Error('Unable to map all Minnesota DNR OHV route source rows to route IDs.');
  }

  for (const chunk of chunkRows(sourceRows)) {
    const { error } = await admin
      .from('verified_route_sources')
      .upsert(chunk, { onConflict: 'verified_route_id,route_source_id,source_role' });
    if (error) throw new Error('Unable to batch upsert Minnesota DNR OHV route source rows.');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  const tokenFailure = requireSyncToken(req);
  if (tokenFailure) return tokenFailure;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sourceFeatures = normalizeMinnesotaOhvFeatureCollection({ features: body.sourceFeatures ?? body.features });
    if (sourceFeatures.length === 0) {
      return jsonResponse({
        ok: false,
        error: 'GeoPackage-converted sourceFeatures are required for Minnesota DNR OHV sync',
        officialDownloadUrl: MINNESOTA_OHV_DOWNLOADS.geopackage,
      }, 400);
    }

    const minMiles = Math.max(0.1, readNumber(body.minMiles ?? body.min_miles, 1));
    const maxFeatures = Math.max(1, Math.min(1000, Math.round(readNumber(body.maxFeatures ?? body.max_features, sourceFeatures.length))));
    const features = sourceFeatures.slice(0, maxFeatures);
    const now = new Date().toISOString();
    const admin = createAdminClient();

    const { data: source, error: sourceError } = await admin
      .from('route_sources')
      .upsert(minnesotaOhvSourceUpsert(now), { onConflict: 'provider_id' })
      .select('id')
      .single();
    if (sourceError || !source) throw new Error('Unable to upsert Minnesota DNR OHV route source');

    const { data: ingestRun, error: ingestError } = await admin
      .from('route_source_ingest_runs')
      .insert({
        route_source_id: source.id,
        status: 'running',
        source_uri: MINNESOTA_OHV_SOURCE.sourceUri,
        started_at: now,
        metadata: {
          providerId: 'minnesota_dnr_ohv_trails',
          officialDownloadUrl: MINNESOTA_OHV_DOWNLOADS.geopackage,
          minMiles,
          maxFeatures,
          sourceFeatures: features.length,
          conversion: 'github_workflow_geopackage_to_geojson',
        },
      })
      .select('id')
      .single();
    if (ingestError || !ingestRun) throw new Error('Unable to start Minnesota DNR OHV ingest run');

    const rawFeatureRows: Array<Record<string, unknown>> = [];
    const routeRows: Array<Record<string, unknown>> = [];
    const sourceRefs: Array<{ publicId: string; source: Record<string, unknown> }> = [];

    for (const feature of features) {
      const upsert = featureToMinnesotaOhvRouteUpsert(feature, {
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
        metadata: {
          providerId: 'minnesota_dnr_ohv_trails',
          officialDownloadUrl: MINNESOTA_OHV_DOWNLOADS.geopackage,
          minMiles,
          maxFeatures,
          sourceFeatures: features.length,
          publicRecommendationCount: 0,
        },
      })
      .eq('id', ingestRun.id);

    return jsonResponse({
      ok: true,
      source: 'minnesota_dnr_ohv_trails',
      rawFeatureCount: features.length,
      normalizedFeatureCount: routeRows.length,
      publicRecommendationCount: 0,
      officialDownloadUrl: MINNESOTA_OHV_DOWNLOADS.geopackage,
      caveat: 'Minnesota DNR OHV records are official state source inputs for curation only. They do not become public Suggested Routes until current DNR closures, local rules, seasonal conditions, vehicle fit, and ECS route curation pass.',
    });
  } catch (error) {
    console.error('[route-catalog-sync-minnesota-ohv]', {
      message: error instanceof Error ? error.message : 'Unknown Minnesota DNR OHV sync failure.',
    });
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Minnesota DNR OHV sync failed.',
    }, 500);
  }
});

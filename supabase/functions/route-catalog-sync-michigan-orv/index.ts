/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  MICHIGAN_ORV_SOURCE,
  gpxTrackToMichiganOrvRouteUpsert,
  michiganOrvSourceUpsert,
  parseMichiganOrvGpxTracks,
  selectMichiganOrvGpxSources,
  type MichiganOrvGpxSource,
} from '../_shared/routeCatalogMichiganOrv.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ecs-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const GEOMETRY_BATCH_SIZE = 10;

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
    if (error) throw new Error(`Unable to batch upsert Michigan DNR ORV raw source features: ${error.message}`);
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
    if (error) throw new Error(`Unable to batch upsert Michigan DNR ORV route rows: ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Unable to batch upsert Michigan DNR ORV route rows: no rows returned.');
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
    throw new Error('Unable to map all Michigan DNR ORV route source rows to route IDs.');
  }

  for (const chunk of chunkRows(sourceRows)) {
    const { error } = await admin
      .from('verified_route_sources')
      .upsert(chunk, { onConflict: 'verified_route_id,route_source_id,source_role' });
    if (error) throw new Error(`Unable to batch upsert Michigan DNR ORV route source rows: ${error.message}`);
  }
}

async function fetchGpxText(source: MichiganOrvGpxSource): Promise<string> {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Michigan DNR ORV GPX fetch failed for ${source.key}: HTTP ${response.status}`);
  return await response.text();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST required' }, 405);

  const tokenFailure = requireSyncToken(req);
  if (tokenFailure) return tokenFailure;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sourceKeys = body.sourceKeys ?? body.source_keys ?? body.sources;
    const sources = selectMichiganOrvGpxSources(sourceKeys);
    if (sources.length === 0) {
      return jsonResponse({ ok: false, error: 'At least one valid Michigan DNR ORV GPX source key is required' }, 400);
    }
    const minMiles = Math.max(0.1, readNumber(body.minMiles ?? body.min_miles, 1));
    const maxTracksPerSource = Math.max(1, Math.min(100, Math.round(readNumber(body.maxTracksPerSource ?? body.max_tracks_per_source, 20))));
    const now = new Date().toISOString();
    const admin = createAdminClient();

    const { data: source, error: sourceError } = await admin
      .from('route_sources')
      .upsert(michiganOrvSourceUpsert(now), { onConflict: 'provider_id' })
      .select('id')
      .single();
    if (sourceError) throw new Error(`Unable to upsert Michigan DNR ORV route source: ${sourceError.message}`);
    if (!source) throw new Error('Unable to upsert Michigan DNR ORV route source: no source returned');

    const { data: ingestRun, error: ingestError } = await admin
      .from('route_source_ingest_runs')
      .insert({
        route_source_id: source.id,
        status: 'running',
        source_uri: MICHIGAN_ORV_SOURCE.sourceUri,
        started_at: now,
        metadata: { providerId: 'michigan_dnr_orv_gpx', sourceKeys: sources.map((item) => item.key), minMiles, maxTracksPerSource },
      })
      .select('id')
      .single();
    if (ingestError) throw new Error(`Unable to start Michigan DNR ORV ingest run: ${ingestError.message}`);
    if (!ingestRun) throw new Error('Unable to start Michigan DNR ORV ingest run: no ingest run returned');

    let rawFeatureCount = 0;
    let normalizedFeatureCount = 0;
    const sourceSummaries = [];
    const rawFeatureRows: Array<Record<string, unknown>> = [];
    const routeRows: Array<Record<string, unknown>> = [];
    const sourceRefs: Array<{ publicId: string; source: Record<string, unknown> }> = [];

    for (const gpxSource of sources) {
      const gpxText = await fetchGpxText(gpxSource);
      const tracks = parseMichiganOrvGpxTracks(gpxText, gpxSource).slice(0, maxTracksPerSource);
      rawFeatureCount += tracks.length;
      let sourceNormalizedFeatureCount = 0;

      for (const track of tracks) {
        const upsert = gpxTrackToMichiganOrvRouteUpsert(track, {
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
        normalizedFeatureCount += 1;
        sourceNormalizedFeatureCount += 1;
      }

      sourceSummaries.push({
        sourceKey: gpxSource.key,
        sourceName: gpxSource.name,
        rawFeatureCount: tracks.length,
        normalizedFeatureCount: sourceNormalizedFeatureCount,
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
        raw_feature_count: rawFeatureCount,
        normalized_feature_count: normalizedFeatureCount,
        metadata: { providerId: 'michigan_dnr_orv_gpx', sourceKeys: sources.map((item) => item.key), minMiles, maxTracksPerSource, sources: sourceSummaries, publicRecommendationCount },
      })
      .eq('id', ingestRun.id);

    return jsonResponse({
      ok: true,
      source: 'michigan_dnr_orv_gpx',
      sourceKeys: sources.map((item) => item.key),
      sources: sourceSummaries,
      rawFeatureCount,
      normalizedFeatureCount,
      publicRecommendationCount,
      caveat: 'Michigan DNR ORV GPX records are official state source-backed public recommendations with visible warnings. Current DNR closures, permits, local rules, seasonal conditions, and vehicle fit still require trip-date checks.',
    });
  } catch (error) {
    console.error('[route-catalog-sync-michigan-orv]', {
      message: error instanceof Error ? error.message : 'Unknown Michigan DNR ORV sync failure.',
    });
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Michigan DNR ORV sync failed.',
    }, 500);
  }
});

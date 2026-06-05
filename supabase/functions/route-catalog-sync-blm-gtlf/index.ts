/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  BLM_GTLF_LAYERS,
  applyBlmGtlfCurrentConditionSources,
  aggregateBlmGtlfRouteFeatures,
  arcGisFeatureToBlmGtlfRouteUpsert,
  blmGtlfSourceUpsert,
  buildBlmGtlfWhereClause,
  normalizeBlmGtlfCurrentConditionSources,
  normalizeBlmGtlfFeatureCollection,
  routeCurrentConditionSourceUpsertForBlmGtlf,
  type BlmGtlfLayer,
} from '../_shared/routeCatalogBlmGtlf.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ecs-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const DEFAULT_STATES = ['AK', 'AZ', 'CA', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY'];

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

function selectStates(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : DEFAULT_STATES;
  const states = Array.from(new Set(
    rawValues
      .map((state) => String(state ?? '').trim().toUpperCase())
      .filter((state) => /^[A-Z]{2}$/.test(state)),
  ));
  return states.length > 0 ? states : DEFAULT_STATES;
}

function selectLayers(value: unknown): BlmGtlfLayer[] {
  if (!Array.isArray(value) || value.length === 0) return BLM_GTLF_LAYERS;
  const requested = new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item)));
  const layers = BLM_GTLF_LAYERS.filter((layer) => requested.has(layer.id));
  return layers.length > 0 ? layers : BLM_GTLF_LAYERS;
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
    if (error) throw new Error('Unable to batch upsert BLM GTLF raw source features.');
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
    if (error || !Array.isArray(data)) throw new Error('Unable to batch upsert BLM GTLF route rows.');
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
    throw new Error('Unable to map all BLM GTLF route source rows to route IDs.');
  }

  for (const chunk of chunkRows(sourceRows)) {
    const { error } = await admin
      .from('verified_route_sources')
      .upsert(chunk, { onConflict: 'verified_route_id,route_source_id,source_role' });
    if (error) throw new Error('Unable to batch upsert BLM GTLF route source rows.');
  }
}

async function fetchLayerFeatures(
  states: string[],
  layer: BlmGtlfLayer,
  minMiles: number,
  limitPerStateLayer: number,
) {
  const records = [];
  const pageSize = Math.min(1000, Math.max(1, limitPerStateLayer));
  let offset = 0;
  const limit = states.length * limitPerStateLayer;

  while (records.length < limit) {
    const params = new URLSearchParams({
      f: 'json',
      where: buildBlmGtlfWhereClause(states, { minMiles }),
      outFields: [
        'OBJECTID',
        'FLTP_CODE',
        'DSTRBTE_EXTRNL_CODE',
        'ADMIN_ST',
        'PLAN_ROUTE_DSGNTN_AUTH',
        'PLAN_ASSET_CLASS',
        'PLAN_OHV_ROUTE_DSGNTN',
        'OHV_ROUTE_DSGNTN_LIM',
        'OHV_DSGNTN_LIM_EXPLAIN',
        'NEPA_DOC_NUM',
        'ROUTE_PLAN_ID',
        'PLAN_PRMRY_ROUTE_MNGT_OBJTV',
        'PLAN_MODE_TRNSPRT',
        'PLAN_ALLOW_MODE_TRNSPRT',
        'PLAN_ACCESS_RSTRCT',
        'PLAN_SEASON_RSTRCT_CODE',
        'OBSRVE_SRFCE_TYPE',
        'OBSRVE_ROUTE_USE_CLASS',
        'ROUTE_PRMRY_NM',
        'ROUTE_SCNDRY_SPCL_DSGNTN_NM',
        'ROUTE_SPCL_DSGNTN_TYPE',
        'TMA_ID',
        'TMP_ID',
        'FAMS_ID',
        'EXSTNG_AUTH_CODE',
        'GIS_MILES',
        'BLM_MILES',
        'GlobalID',
      ].join(','),
      returnGeometry: 'true',
      outSR: '4326',
      geometryPrecision: '6',
      resultOffset: String(offset),
      resultRecordCount: String(Math.min(pageSize, limit - records.length)),
    });

    const response = await fetch(`${layer.url}/query?${params.toString()}`);
    if (!response.ok) throw new Error(`BLM GTLF layer ${layer.id} query failed`);
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(`BLM GTLF layer ${layer.id} query error: ${payload.error.message ?? 'ArcGIS query failed'}`);
    }
    const page = normalizeBlmGtlfFeatureCollection(payload);
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
    const states = selectStates(body.states ?? body.adminStates ?? body.admin_states);
    const layers = selectLayers(body.layers);
    const minMiles = Math.max(0.1, readNumber(body.minMiles ?? body.min_miles, 1));
    const limitPerStateLayer = Math.max(1, Math.min(500, Math.round(readNumber(body.limitPerStateLayer ?? body.limit_per_state_layer, 100))));
    const now = new Date().toISOString();
    const currentConditionSources = normalizeBlmGtlfCurrentConditionSources(
      body.currentConditions ?? body.current_conditions,
      states,
      now,
    );
    const admin = createAdminClient();

    for (const currentConditionSource of currentConditionSources) {
      const { error: currentConditionSourceError } = await admin
        .from('route_sources')
        .upsert(routeCurrentConditionSourceUpsertForBlmGtlf(currentConditionSource), { onConflict: 'provider_id' });
      if (currentConditionSourceError) {
        throw new Error(`Unable to upsert current-condition source for BLM ${currentConditionSource.adminState}`);
      }
    }

    const { data: source, error: sourceError } = await admin
      .from('route_sources')
      .upsert(blmGtlfSourceUpsert(now), { onConflict: 'provider_id' })
      .select('id')
      .single();
    if (sourceError || !source) throw new Error('Unable to upsert BLM GTLF route source');

    const { data: ingestRun, error: ingestError } = await admin
      .from('route_source_ingest_runs')
      .insert({
        route_source_id: source.id,
        status: 'running',
        source_uri: BLM_GTLF_LAYERS[0].url,
        started_at: now,
        metadata: { providerId: 'blm_gtlf', states, minMiles, limitPerStateLayer, layers: layers.map((layer) => layer.id) },
      })
      .select('id')
      .single();
    if (ingestError || !ingestRun) throw new Error('Unable to start BLM GTLF ingest run');

    let rawFeatureCount = 0;
    let normalizedFeatureCount = 0;
    let aggregateRouteCount = 0;
    let publicRecommendationCount = 0;
    const currentConditionClosureCount = currentConditionSources.reduce(
      (count, sourceRecord) => count + sourceRecord.closures.length,
      0,
    );
    const currentConditionAdvisoryCount = currentConditionSources.reduce(
      (count, sourceRecord) => count + sourceRecord.advisories.length,
      0,
    );
    let currentConditionBlockedRouteCount = 0;
    const layerSummaries = [];
    const rawFeatureRows: Array<Record<string, unknown>> = [];
    const routeRows: Array<Record<string, unknown>> = [];
    const sourceRefs: Array<{ publicId: string; source: Record<string, unknown> }> = [];

    for (const layer of layers) {
      const features = [];
      for (const state of states) {
        features.push(...await fetchLayerFeatures([state], layer, minMiles, limitPerStateLayer));
      }
      rawFeatureCount += features.length;
      let layerNormalizedFeatureCount = 0;
      let layerPublicRecommendationCount = 0;
      let layerCurrentConditionBlockedRouteCount = 0;

      for (const feature of features) {
        const upsert = arcGisFeatureToBlmGtlfRouteUpsert(feature, {
          layer,
          sourceId: source.id,
          sourceLastVerifiedAt: now,
          ingestRunId: ingestRun.id,
          minMiles,
        });
        if (!upsert) continue;

        const conditionCheckedUpsert = applyBlmGtlfCurrentConditionSources(upsert, currentConditionSources);
        if (Number(conditionCheckedUpsert.verifiedRoute.active_closure_count ?? 0) > 0) {
          currentConditionBlockedRouteCount += 1;
          layerCurrentConditionBlockedRouteCount += 1;
        }

        rawFeatureRows.push(conditionCheckedUpsert.rawSourceFeature);
        routeRows.push(conditionCheckedUpsert.verifiedRoute);
        sourceRefs.push({
          publicId: routePublicId(conditionCheckedUpsert.verifiedRoute),
          source: conditionCheckedUpsert.verifiedRouteSource,
        });
        normalizedFeatureCount += 1;
        layerNormalizedFeatureCount += 1;
      }

      const aggregates = aggregateBlmGtlfRouteFeatures(features, {
        layer,
        sourceId: source.id,
        sourceLastVerifiedAt: now,
        ingestRunId: ingestRun.id,
        minMiles,
      }).map((aggregate) => applyBlmGtlfCurrentConditionSources(aggregate, currentConditionSources));
      layerCurrentConditionBlockedRouteCount += aggregates.filter((aggregate) =>
        Number(aggregate.verifiedRoute.active_closure_count ?? 0) > 0
      ).length;
      currentConditionBlockedRouteCount += aggregates.filter((aggregate) =>
        Number(aggregate.verifiedRoute.active_closure_count ?? 0) > 0
      ).length;
      layerPublicRecommendationCount += aggregates.filter((aggregate) =>
        aggregate.verifiedRoute.recommendation_status === 'recommendable'
      ).length;
      publicRecommendationCount += layerPublicRecommendationCount;

      for (const aggregate of aggregates) {
        routeRows.push(aggregate.verifiedRoute);
        sourceRefs.push({
          publicId: routePublicId(aggregate.verifiedRoute),
          source: aggregate.verifiedRouteSource,
        });
      }
      aggregateRouteCount += aggregates.length;

      layerSummaries.push({
        layerId: layer.id,
        layerName: layer.name,
        rawFeatureCount: features.length,
        normalizedFeatureCount: layerNormalizedFeatureCount,
        aggregateRouteCount: aggregates.length,
        publicRecommendationCount: layerPublicRecommendationCount,
        currentConditionBlockedRouteCount: layerCurrentConditionBlockedRouteCount,
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
        raw_feature_count: rawFeatureCount,
        normalized_feature_count: normalizedFeatureCount,
        metadata: {
          providerId: 'blm_gtlf',
          states,
          minMiles,
          limitPerStateLayer,
          aggregateRouteCount,
          publicRecommendationCount,
          currentConditionSourceCount: currentConditionSources.length,
          currentConditionClosureCount,
          currentConditionAdvisoryCount,
          currentConditionBlockedRouteCount,
          layers: layerSummaries,
        },
      })
      .eq('id', ingestRun.id);

    return jsonResponse({
      ok: true,
      source: 'blm_gtlf',
      states,
      layers: layerSummaries,
      rawFeatureCount,
      normalizedFeatureCount,
      aggregateRouteCount,
      publicRecommendationCount,
      currentConditionSourceCount: currentConditionSources.length,
      currentConditionClosureCount,
      currentConditionAdvisoryCount,
      currentConditionBlockedRouteCount,
      caveat: 'BLM GTLF public recommendations are strict aggregates of open public motorized source segments only. Limited, seasonal, restricted, incomplete, or ungrouped records remain curation-only.',
    });
  } catch (error) {
    console.error('[route-catalog-sync-blm-gtlf]', {
      message: error instanceof Error ? error.message : 'Unknown BLM GTLF sync failure.',
    });
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'BLM GTLF sync failed.',
    }, 500);
  }
});

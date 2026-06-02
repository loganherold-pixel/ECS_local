/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  USFS_MVUM_LAYERS,
  USFS_MVUM_PILOT_FORESTS,
  applyUsfsMvumCurrentConditionSources,
  aggregateUsfsMvumRouteFeatures,
  arcGisFeatureToVerifiedRouteUpsert,
  buildUsfsMvumWhereClause,
  normalizeUsfsMvumCurrentConditionSources,
  normalizeUsfsMvumFeatureCollection,
  routeCurrentConditionSourceUpsertForForest,
  routeSourceUpsertForForest,
  type UsfsMvumForest,
  type UsfsMvumLayer,
} from '../_shared/routeCatalogUsfsMvum.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ecs-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const DEFAULT_USFS_MVUM_ARCGIS_OFFSET_DEGREES = 0.000025;
const MAX_USFS_MVUM_ARCGIS_OFFSET_DEGREES = 0.001;
const DEFAULT_USFS_MVUM_LIMIT_PER_FOREST_LAYER = 150;
const MAX_USFS_MVUM_LIMIT_PER_FOREST_LAYER = 500;
const MAX_DEEP_USFS_MVUM_LIMIT_PER_FOREST_LAYER = 2500;

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

function selectForests(value: unknown): UsfsMvumForest[] {
  if (!Array.isArray(value) || value.length === 0) return USFS_MVUM_PILOT_FORESTS;
  const requested = new Set(value.map((item) => String(item ?? '').trim().toLowerCase()));
  const selected = USFS_MVUM_PILOT_FORESTS.filter((forest) =>
    requested.has(forest.slug) ||
    requested.has(forest.forestName.toLowerCase()) ||
    requested.has(forest.sourceProviderId.toLowerCase()),
  );
  return selected.length > 0 ? selected : USFS_MVUM_PILOT_FORESTS;
}

function readNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'deep'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'cautious'].includes(normalized)) return false;
  }
  return fallback;
}

function readLimitPerForestLayer(value: unknown, deepPagination: boolean): number {
  const fallback = deepPagination
    ? MAX_DEEP_USFS_MVUM_LIMIT_PER_FOREST_LAYER
    : DEFAULT_USFS_MVUM_LIMIT_PER_FOREST_LAYER;
  const max = deepPagination
    ? MAX_DEEP_USFS_MVUM_LIMIT_PER_FOREST_LAYER
    : MAX_USFS_MVUM_LIMIT_PER_FOREST_LAYER;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  return Math.max(1, Math.min(max, Math.round(readNumber(value, fallback))));
}

function readMaxAllowableOffset(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_USFS_MVUM_ARCGIS_OFFSET_DEGREES;
  return Math.min(MAX_USFS_MVUM_ARCGIS_OFFSET_DEGREES, number);
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
    if (error) throw new Error('Unable to batch upsert MVUM raw source features.');
  }
}

async function upsertRouteRows(
  admin: ReturnType<typeof createAdminClient>,
  routeRows: Array<Record<string, unknown>>,
  label: string,
): Promise<Map<string, string>> {
  const allRows = [];
  for (const chunk of chunkRows(routeRows)) {
    const { data, error } = await admin
      .from('verified_routes')
      .upsert(chunk, { onConflict: 'public_id' })
      .select('id, public_id');
    if (error || !Array.isArray(data)) throw new Error(`Unable to batch upsert MVUM ${label} route rows.`);
    allRows.push(...data);
  }
  return buildRouteIdByPublicId(allRows as Array<Record<string, unknown>>);
}

async function upsertRouteSourceRows(
  admin: ReturnType<typeof createAdminClient>,
  sourceRefs: Array<{ publicId: string; source: Record<string, unknown> }>,
  routeIdByPublicId: Map<string, string>,
  label: string,
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
    throw new Error(`Unable to map all MVUM ${label} route source rows to route IDs.`);
  }

  for (const chunk of chunkRows(sourceRows)) {
    const { error } = await admin
      .from('verified_route_sources')
      .upsert(chunk, { onConflict: 'verified_route_id,route_source_id,source_role' });
    if (error) throw new Error(`Unable to batch upsert MVUM ${label} route source rows.`);
  }
}

async function fetchLayerFeatures(
  forest: UsfsMvumForest,
  layer: UsfsMvumLayer,
  minMiles: number,
  limit: number,
  maxAllowableOffset: number,
) {
  const records = [];
  const pageSize = Math.min(1000, Math.max(1, limit));
  let offset = 0;

  while (records.length < limit) {
    const params = new URLSearchParams({
      f: 'json',
      where: buildUsfsMvumWhereClause([forest], { minMiles }),
      outFields: [
        'FID',
        'RTE_CN',
        'ID',
        'FIELD_ID',
        'NAME',
        'GIS_MILES',
        'SEG_LENGTH',
        'SEASONAL',
        'PASSENGERV',
        'HIGHCLEARA',
        'FOURWD_GT5',
        'ATV',
        'OTHER_OHV_',
        'OTHER_OHV1',
        'MOTORCYCLE',
        'FORESTNAME',
        'DISTRICTNA',
        layer.statusField,
      ].join(','),
      returnGeometry: 'true',
      outSR: '4326',
      geometryPrecision: '6',
      maxAllowableOffset: String(maxAllowableOffset),
      resultOffset: String(offset),
      resultRecordCount: String(Math.min(pageSize, limit - records.length)),
    });

    const response = await fetch(`${layer.url}/query?${params.toString()}`);
    if (!response.ok) throw new Error(`USFS MVUM ${layer.kind} query failed for ${forest.forestName}`);
    const payload = await response.json();
    if (payload?.error) {
      throw new Error(
        `USFS MVUM ${layer.kind} query error for ${forest.forestName}: ${payload.error.message ?? 'ArcGIS query failed'}`,
      );
    }
    const page = normalizeUsfsMvumFeatureCollection(payload);
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
    const forests = selectForests(body.forests);
    const minMiles = Math.max(0.1, readNumber(body.minMiles ?? body.min_miles, 1));
    const deepPagination = readBoolean(body.deepPagination ?? body.deep_pagination);
    const limitPerForestLayer = readLimitPerForestLayer(
      body.limitPerForestLayer ?? body.limit_per_forest_layer,
      deepPagination,
    );
    const maxAllowableOffset = readMaxAllowableOffset(body.maxAllowableOffset ?? body.max_allowable_offset);
    const now = new Date().toISOString();
    const currentConditionSources = normalizeUsfsMvumCurrentConditionSources(
      body.currentConditions ?? body.current_conditions,
      forests,
      now,
    );
    const admin = createAdminClient();
    const summary = [];

    for (const forest of forests) {
      const forestCurrentConditionSources = currentConditionSources.filter((source) => source.forestSlug === forest.slug);
      for (const currentConditionSource of forestCurrentConditionSources) {
        const { error: currentConditionSourceError } = await admin
          .from('route_sources')
          .upsert(routeCurrentConditionSourceUpsertForForest(forest, currentConditionSource), { onConflict: 'provider_id' });
        if (currentConditionSourceError) {
          throw new Error(`Unable to upsert current-condition source for ${forest.forestName}`);
        }
      }

      const { data: source, error: sourceError } = await admin
        .from('route_sources')
        .upsert(routeSourceUpsertForForest(forest), { onConflict: 'provider_id' })
        .select('id')
        .single();
      if (sourceError || !source) throw new Error(`Unable to upsert route source for ${forest.forestName}`);

      const { data: ingestRun, error: ingestError } = await admin
        .from('route_source_ingest_runs')
        .insert({
          route_source_id: source.id,
          status: 'running',
          source_uri: forest.sourceUri,
          started_at: now,
          metadata: {
            forest: forest.forestName,
            providerId: forest.sourceProviderId,
            minMiles,
            limitPerForestLayer,
            deepPagination,
            maxAllowableOffset,
          },
        })
        .select('id')
        .single();
      if (ingestError || !ingestRun) throw new Error(`Unable to start ingest run for ${forest.forestName}`);

      let rawFeatureCount = 0;
      let normalizedFeatureCount = 0;
      let aggregateRouteCount = 0;
      let publicRecommendationCount = 0;
      const currentConditionClosureCount = forestCurrentConditionSources.reduce(
        (count, sourceRecord) => count + sourceRecord.closures.length,
        0,
      );
      let currentConditionBlockedRouteCount = 0;
      const rawFeatureRows: Array<Record<string, unknown>> = [];
      const segmentRouteRows: Array<Record<string, unknown>> = [];
      const segmentSourceRefs: Array<{ publicId: string; source: Record<string, unknown> }> = [];
      const aggregateRouteRows: Array<Record<string, unknown>> = [];
      const aggregateSourceRefs: Array<{ publicId: string; source: Record<string, unknown> }> = [];

      for (const layer of USFS_MVUM_LAYERS) {
        const features = await fetchLayerFeatures(forest, layer, minMiles, limitPerForestLayer, maxAllowableOffset);
        rawFeatureCount += features.length;
        const context = {
          forest,
          layer,
          sourceId: source.id,
          sourceLastVerifiedAt: now,
          ingestRunId: ingestRun.id,
          minMiles,
        };

        for (const feature of features) {
          const upsert = arcGisFeatureToVerifiedRouteUpsert(feature, {
            ...context,
            publicRecommendation: false,
          });
          if (!upsert) continue;

          const conditionCheckedUpsert = applyUsfsMvumCurrentConditionSources(upsert, forestCurrentConditionSources);
          if (Number(conditionCheckedUpsert.verifiedRoute.active_closure_count ?? 0) > 0) {
            currentConditionBlockedRouteCount += 1;
          }

          rawFeatureRows.push(conditionCheckedUpsert.rawSourceFeature);
          segmentRouteRows.push(conditionCheckedUpsert.verifiedRoute);
          segmentSourceRefs.push({
            publicId: routePublicId(conditionCheckedUpsert.verifiedRoute),
            source: conditionCheckedUpsert.verifiedRouteSource,
          });
          normalizedFeatureCount += 1;
        }

        const aggregateUpserts = aggregateUsfsMvumRouteFeatures(features, context)
          .map((aggregate) => applyUsfsMvumCurrentConditionSources(aggregate, forestCurrentConditionSources));
        currentConditionBlockedRouteCount += aggregateUpserts.filter((aggregate) =>
          Number(aggregate.verifiedRoute.active_closure_count ?? 0) > 0,
        ).length;
        publicRecommendationCount += aggregateUpserts.filter((aggregate) =>
          aggregate.verifiedRoute.recommendation_status === 'recommendable',
        ).length;
        aggregateRouteRows.push(...aggregateUpserts.map((aggregate) => aggregate.verifiedRoute));
        aggregateSourceRefs.push(...aggregateUpserts.map((aggregate) => ({
          publicId: routePublicId(aggregate.verifiedRoute),
          source: aggregate.verifiedRouteSource,
        })));
        aggregateRouteCount += aggregateUpserts.length;
      }

      await upsertRawFeatureRows(admin, rawFeatureRows);
      const segmentRouteIdByPublicId = await upsertRouteRows(admin, segmentRouteRows, 'source segment');
      await upsertRouteSourceRows(admin, segmentSourceRefs, segmentRouteIdByPublicId, 'source segment');
      const aggregateRouteIdByPublicId = await upsertRouteRows(admin, aggregateRouteRows, 'aggregate');
      await upsertRouteSourceRows(admin, aggregateSourceRefs, aggregateRouteIdByPublicId, 'aggregate');

      await admin
        .from('route_source_ingest_runs')
        .update({
          status: 'succeeded',
          finished_at: new Date().toISOString(),
          raw_feature_count: rawFeatureCount,
          normalized_feature_count: normalizedFeatureCount,
          metadata: {
            forest: forest.forestName,
            providerId: forest.sourceProviderId,
            minMiles,
            limitPerForestLayer,
            deepPagination,
            maxAllowableOffset,
            aggregateRouteCount,
            publicRecommendationCount,
            currentConditionSourceCount: forestCurrentConditionSources.length,
            currentConditionClosureCount,
            currentConditionBlockedRouteCount,
          },
        })
        .eq('id', ingestRun.id);

      summary.push({
        forest: forest.forestName,
        rawFeatureCount,
        normalizedFeatureCount,
        aggregateRouteCount,
        publicRecommendationCount,
        limitPerForestLayer,
        deepPagination,
        maxAllowableOffset,
        currentConditionSourceCount: forestCurrentConditionSources.length,
        currentConditionClosureCount,
        currentConditionBlockedRouteCount,
      });
    }

    return jsonResponse({
      ok: true,
      source: 'usfs_mvum',
      forests: summary,
      limitPerForestLayer,
      deepPagination,
      maxAllowableOffset,
      caveat: 'USFS MVUM routes verify designated motorized access only. Current closures, weather, fire restrictions, gates, and passability still require current checks.',
    });
  } catch (error) {
    console.error('[route-catalog-sync-usfs-mvum]', {
      message: error instanceof Error ? error.message : 'Unknown USFS MVUM sync failure.',
    });
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'USFS MVUM sync failed.',
    }, 500);
  }
});

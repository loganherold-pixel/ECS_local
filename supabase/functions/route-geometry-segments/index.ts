/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const ROUTE_GEOMETRY_CATALOG_SOURCE = 'verified_routes';
const MIN_ZOOM = 10;
const DEFAULT_LIMIT = 240;
const MAX_LIMIT = 500;
const ROUTE_GEOMETRY_UNAVAILABLE_MESSAGE =
  'ECS trail segments are temporarily unavailable for this map view. Saved and imported route geometry remain available.';
const ROUTE_GEOMETRY_SOURCE_FILTER_UNAVAILABLE_MESSAGE =
  'Source-specific trail filtering is temporarily unavailable. Retry after the route catalog update is applied.';

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function routeGeometryUnavailableResponse(reason: string, sourceProviderPrefix: string | null = null): Response {
  return jsonResponse({
    ok: true,
    segments: [],
    meta: {
      source: ROUTE_GEOMETRY_CATALOG_SOURCE,
      sourceProviderPrefix,
      sourceFilterApplied: sourceProviderPrefix != null,
      bboxFilterApplied: true,
      degraded: true,
      unavailableReason: reason,
      userMessage: ROUTE_GEOMETRY_UNAVAILABLE_MESSAGE,
      candidateCount: 0,
      cappedCount: 0,
      skippedMissingGeometryCount: 0,
      invalidFeatureCount: 0,
      skippedClosedCount: 0,
      fetchedAt: new Date().toISOString(),
    },
  });
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

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function readNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanLimit(value: unknown): number {
  const parsed = readNumber(value);
  if (parsed == null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.round(parsed)));
}

function cleanZoom(value: unknown): number {
  const parsed = readNumber(value);
  return parsed == null ? 0 : parsed;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length < 120 ? text : null;
}

function cleanSourceProviderPrefix(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return normalized || null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1' || text === 'yes') return true;
    if (text === 'false' || text === '0' || text === 'no') return false;
  }
  return fallback;
}

async function requestParams(req: Request): Promise<JsonRecord> {
  const url = new URL(req.url);
  const body = req.method === 'POST'
    ? ((await req.json().catch(() => ({}))) as JsonRecord)
    : {};
  url.searchParams.forEach((value, key) => {
    if (body[key] == null) body[key] = value;
  });
  return body;
}

function cleanBbox(params: JsonRecord): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
  const bbox = readRecord(params.bbox);
  const minLng = readNumber(bbox?.minLng ?? bbox?.west ?? params.minLng ?? params.west);
  const minLat = readNumber(bbox?.minLat ?? bbox?.south ?? params.minLat ?? params.south);
  const maxLng = readNumber(bbox?.maxLng ?? bbox?.east ?? params.maxLng ?? params.east);
  const maxLat = readNumber(bbox?.maxLat ?? bbox?.north ?? params.maxLat ?? params.north);
  if (minLng == null || minLat == null || maxLng == null || maxLat == null) return null;
  const west = Math.max(-180, Math.min(minLng, maxLng));
  const east = Math.min(180, Math.max(minLng, maxLng));
  const south = Math.max(-90, Math.min(minLat, maxLat));
  const north = Math.min(90, Math.max(minLat, maxLat));
  if (east <= west || north <= south) return null;
  return { minLng: west, minLat: south, maxLng: east, maxLat: north };
}

function confidenceFromScore(value: unknown): 'high' | 'medium' | 'low' | 'unknown' {
  const score = readNumber(value);
  if (score == null) return 'unknown';
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

function dataStateFromVerifiedAt(value: unknown): 'live' | 'stale' | 'unknown' {
  const text = cleanText(value);
  if (!text) return 'unknown';
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return 'unknown';
  const days = Math.max(0, (Date.now() - time) / 86_400_000);
  return days > 365 ? 'stale' : 'live';
}

function sourceRecords(row: JsonRecord): JsonRecord[] {
  const value = row.source_records;
  return Array.isArray(value) ? value.map(readRecord).filter((record): record is JsonRecord => !!record) : [];
}

function rowMatchesSourceProviderPrefix(row: JsonRecord, sourceProviderPrefix: string | null): boolean {
  if (!sourceProviderPrefix) return true;
  return sourceRecords(row).some((source) => {
    const providerId = cleanSourceProviderPrefix(source.providerId ?? source.provider_id);
    return providerId?.startsWith(sourceProviderPrefix) === true;
  });
}

function isMissingSourceFilteredRpc(error: unknown): boolean {
  const record = readRecord(error);
  const code = cleanText(record?.code)?.toUpperCase();
  const message = cleanText(record?.message)?.toLowerCase() ?? '';
  return code === 'PGRST202' || (
    message.includes('search_route_geometry_segments_for_viewport_v2') &&
    (message.includes('schema cache') || message.includes('could not find the function'))
  );
}

function sourceLabel(row: JsonRecord): string {
  const primary = sourceRecords(row)[0];
  return (
    cleanText(primary?.label) ??
    cleanText(primary?.providerId ?? primary?.provider_id) ??
    cleanText(row.land_manager) ??
    'ECS Route Catalog'
  );
}

function firstSourceValue(row: JsonRecord, key: string): string | null {
  for (const source of sourceRecords(row)) {
    const value = cleanText(source[key]);
    if (value) return value;
  }
  return null;
}

function warningsForRow(row: JsonRecord): string[] {
  const warnings = new Set<string>();
  const legalityStatus = String(row.legality_status ?? 'geometry_only');
  const publicAccessStatus = String(row.public_access_status ?? 'unknown');
  if (legalityStatus === 'geometry_only') {
    warnings.add('Geometry-only reference segment; legal access has not been fully verified.');
  }
  if (legalityStatus === 'community_unverified') {
    warnings.add('Community-suggested reference segment; verify legal access and current conditions.');
  }
  if (publicAccessStatus === 'unknown') {
    warnings.add('Public access status is unknown for this segment.');
  }
  if (publicAccessStatus === 'limited') {
    warnings.add('Public access is limited; verify vehicle class, season, and posted rules.');
  }
  if (dataStateFromVerifiedAt(row.source_last_updated) === 'stale') {
    warnings.add('Source verification is stale.');
  }
  return [...warnings];
}

function shapeSegment(row: JsonRecord): JsonRecord | null {
  const geometry = readRecord(row.geometry);
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return null;
  return {
    id: String(row.id ?? ''),
    name: cleanText(row.canonical_name) ?? cleanText(row.route_number) ?? 'ECS Route Geometry',
    sourceKind: 'route_catalog',
    sourceId: String(row.id ?? ''),
    sourceLabel: sourceLabel(row),
    dataState: dataStateFromVerifiedAt(row.source_last_updated),
    confidence: confidenceFromScore(row.confidence_score),
    legalityStatus: row.legality_status ?? 'geometry_only',
    publicAccessStatus: row.public_access_status ?? 'unknown',
    warnings: warningsForRow(row),
    attribution: firstSourceValue(row, 'attribution'),
    license: firstSourceValue(row, 'license'),
    lastVerifiedAt: row.source_last_updated ?? firstSourceValue(row, 'lastVerifiedAt') ?? firstSourceValue(row, 'last_verified_at'),
    geometry,
    source_records: sourceRecords(row),
    segmentType: row.segment_type ?? 'unknown',
    surface: row.surface ?? 'unknown',
    landManager: row.land_manager ?? null,
    managingUnit: row.managing_unit ?? null,
    lengthMeters: row.length_meters ?? null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ ok: false, error: 'GET or POST required' }, 405);

  let sourceProviderPrefix: string | null = null;
  try {
    const params = await requestParams(req);
    const bbox = cleanBbox(params);
    if (!bbox) return jsonResponse({ ok: false, error: 'Valid bbox required' }, 400);

    const zoom = cleanZoom(params.zoom);
    const maxLimit = cleanLimit(params.limit);
    const includeReferenceGeometry = readBoolean(params.includeReferenceGeometry ?? params.include_reference_geometry, true);
    const vehicleClass = cleanText(params.vehicleClass ?? params.vehicle_class);
    sourceProviderPrefix = cleanSourceProviderPrefix(
      params.sourceProviderPrefix ?? params.source_provider_prefix,
    );
    if (zoom < MIN_ZOOM) {
      return jsonResponse({
        ok: true,
        segments: [],
        meta: {
          source: ROUTE_GEOMETRY_CATALOG_SOURCE,
          sourceProviderPrefix,
          sourceFilterApplied: sourceProviderPrefix != null,
          bboxFilterApplied: true,
          zoomTooLow: true,
          minZoom: MIN_ZOOM,
          candidateCount: 0,
          cappedCount: 0,
          skippedMissingGeometryCount: 0,
          invalidFeatureCount: 0,
          skippedClosedCount: 0,
        },
      });
    }

    const admin = createAdminClient();
    const rpcArgs = {
      p_min_lng: bbox.minLng,
      p_min_lat: bbox.minLat,
      p_max_lng: bbox.maxLng,
      p_max_lat: bbox.maxLat,
      p_zoom: zoom,
      p_limit: maxLimit,
      p_include_reference_geometry: includeReferenceGeometry,
      p_vehicle_class: vehicleClass,
    };
    let sourceFilterMode: 'none' | 'database' | 'edge_compatibility' = 'none';
    let rpcResult = sourceProviderPrefix
      ? await admin.rpc('search_route_geometry_segments_for_viewport_v2', {
          ...rpcArgs,
          p_source_provider_prefix: sourceProviderPrefix,
        })
      : await admin.rpc('search_route_geometry_segments_for_viewport', rpcArgs);

    if (sourceProviderPrefix && rpcResult.error && isMissingSourceFilteredRpc(rpcResult.error)) {
      sourceFilterMode = 'edge_compatibility';
      rpcResult = await admin.rpc('search_route_geometry_segments_for_viewport', {
        ...rpcArgs,
        p_limit: MAX_LIMIT,
      });
    } else if (sourceProviderPrefix && !rpcResult.error) {
      sourceFilterMode = 'database';
    }

    const { data, error } = rpcResult;
    if (error) throw new Error(error.message || 'Unable to search route geometry segments.');

    const rawRows = Array.isArray(data) ? data as JsonRecord[] : [];
    const sourceMatchedRows = sourceProviderPrefix && sourceFilterMode !== 'database'
      ? rawRows.filter((row) => rowMatchesSourceProviderPrefix(row, sourceProviderPrefix))
      : rawRows;
    const sourceFilterDegraded = sourceFilterMode === 'edge_compatibility';
    const cappedCount = Math.max(0, sourceMatchedRows.length - maxLimit);
    let skippedMissingGeometryCount = 0;
    let invalidFeatureCount = 0;
    const segments = sourceMatchedRows
      .slice(0, maxLimit)
      .map(shapeSegment)
      .filter((segment): segment is JsonRecord => {
        if (!segment) {
          skippedMissingGeometryCount += 1;
          invalidFeatureCount += 1;
        }
        return !!segment;
      });

    return jsonResponse({
      ok: true,
      segments,
      meta: {
        source: ROUTE_GEOMETRY_CATALOG_SOURCE,
        sourceProviderPrefix,
        sourceFilterApplied: sourceProviderPrefix != null,
        sourceFilterMode,
        degraded: sourceFilterDegraded,
        unavailableReason: sourceFilterDegraded ? 'source_filter_migration_unavailable' : null,
        userMessage: sourceFilterDegraded ? ROUTE_GEOMETRY_SOURCE_FILTER_UNAVAILABLE_MESSAGE : null,
        sourceFilteredCount: Math.max(0, rawRows.length - sourceMatchedRows.length),
        unfilteredCandidateCount: sourceFilterMode === 'database' ? null : rawRows.length,
        bboxFilterApplied: true,
        zoomTooLow: false,
        minZoom: MIN_ZOOM,
        candidateCount: sourceMatchedRows.length,
        cappedCount,
        skippedMissingGeometryCount,
        invalidFeatureCount,
        skippedClosedCount: 0,
        includeReferenceGeometry,
        vehicleClass,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[route-geometry-segments]', {
      message: error instanceof Error ? error.message : 'Unknown route geometry viewport failure.',
    });
    return routeGeometryUnavailableResponse('backend_unavailable', sourceProviderPrefix);
  }
});

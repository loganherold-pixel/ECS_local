/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  CAMPING_IDENTITY_TERMS,
  buildCampgroundSearchFeatureCollection,
  filterCampgroundSearchRows,
  groupAvailabilityRows,
  rowHasEstablishedCampgroundIdentity,
  parseCampgroundSearchParams,
  type CampgroundSearchParams,
  type CampgroundAvailabilityRow,
  type CampgroundDbRow,
} from '../_shared/campgroundApi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function getEnvOrNull(name: string): string | null {
  const value = Deno.env.get(name);
  return value && value.trim() ? value.trim() : null;
}

function logCampgroundSearch(level: 'info' | 'warn' | 'error', event: string, details: Record<string, unknown>) {
  const payload = {
    event,
    ...details,
  };
  if (level === 'error') {
    console.error('[campgrounds-search]', payload);
  } else if (level === 'warn') {
    console.warn('[campgrounds-search]', payload);
  } else {
    console.info('[campgrounds-search]', payload);
  }
}

function createAdminClient() {
  return createClient(
    getEnvAny(['ECS_SUPABASE_URL', 'SUPABASE_URL']),
    getEnvAny(['ECS_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function requestParams(req: Request): Promise<URLSearchParams | Record<string, unknown>> {
  const url = new URL(req.url);
  if (req.method === 'GET') return url.searchParams;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.bbox && url.searchParams.get('bbox')) body.bbox = url.searchParams.get('bbox');
  return body;
}

type CampgroundSearchSource = 'ecs_cached_campgrounds' | 'osm_overpass_fallback';

type CampgroundRowsResult = {
  rows: CampgroundDbRow[];
  source: CampgroundSearchSource;
  fallbackReason?: string;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text : null;
}

function normalizeOsmToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function bboxArea(params: CampgroundSearchParams): number {
  const { bbox } = params;
  return Math.abs((bbox.maxLng - bbox.minLng) * (bbox.maxLat - bbox.minLat));
}

type OsmElement = {
  type?: string;
  id?: number | string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, unknown>;
};

function osmElementToCampgroundRow(element: OsmElement): CampgroundDbRow | null {
  const tags = element.tags ?? {};
  const tourism = normalizeOsmToken(tags.tourism);
  if (!['camp_site', 'caravan_site', 'camp_pitch'].includes(tourism)) return null;

  const latitude = typeof element.lat === 'number' ? element.lat : element.center?.lat;
  const longitude = typeof element.lon === 'number' ? element.lon : element.center?.lon;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const id = normalizeText(element.id);
  const type = normalizeText(element.type) ?? 'osm';
  if (!id) return null;

  const name =
    normalizeText(tags.name) ??
    normalizeText(tags.operator) ??
    normalizeText(tags.brand) ??
    `Unnamed campground ${id}`;
  const facilityType = tourism === 'caravan_site' ? 'rv_park' : 'campground';
  const amenities = [
    tags.drinking_water === 'yes' || tags.water_point === 'yes' ? 'water' : null,
    tags.toilets === 'yes' ? 'toilets' : null,
    tags.shower === 'yes' || tags.showers === 'yes' ? 'showers' : null,
    tags.power_supply === 'yes' ? 'hookups' : null,
    tags.sanitary_dump_station === 'yes' ? 'dump_station' : null,
  ].filter((item): item is string => !!item);

  return {
    id: `osm:${type}:${id}`,
    name,
    latitude,
    longitude,
    facility_type: facilityType,
    managing_agency: normalizeText(tags.operator),
    managing_org: normalizeText(tags.operator),
    reservation_url: normalizeText(tags.website) ?? normalizeText(tags.url),
    detail_url: normalizeText(tags.website) ?? normalizeText(tags.url),
    status: 'unknown',
    availability_status: 'unknown',
    site_count: null,
    site_types: [facilityType],
    amenities,
    source_confidence: 58,
    primary_provider: 'osm',
    attribution: 'OpenStreetMap contributors',
    last_synced_at: new Date().toISOString(),
    last_verified_at: null,
    last_availability_checked_at: null,
  };
}

function buildOsmOverpassQuery(params: CampgroundSearchParams): string {
  const { minLng, minLat, maxLng, maxLat } = params.bbox;
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
  return `
[out:json][timeout:25];
(
  node["tourism"~"^(camp_site|caravan_site|camp_pitch)$"](${bbox});
  way["tourism"~"^(camp_site|caravan_site|camp_pitch)$"](${bbox});
  relation["tourism"~"^(camp_site|caravan_site|camp_pitch)$"](${bbox});
);
out center tags ${Math.min(params.limit * 4, 1000)};
`;
}

async function fetchOsmFallbackCampgrounds(params: CampgroundSearchParams, reason: string): Promise<CampgroundDbRow[]> {
  const userAgent = getEnvOrNull('OSM_USER_AGENT');
  if (!userAgent) {
    logCampgroundSearch('warn', 'osm_fallback_skipped', {
      reason,
      missingConfig: 'OSM_USER_AGENT',
    });
    return [];
  }

  if (bboxArea(params) > 4) {
    logCampgroundSearch('warn', 'osm_fallback_skipped', {
      reason,
      skippedReason: 'bbox_too_large',
      bboxArea: Number(bboxArea(params).toFixed(3)),
    });
    return [];
  }

  const overpassUrl = getEnvOrNull('OSM_OVERPASS_URL') ?? 'https://overpass-api.de/api/interpreter';
  const query = buildOsmOverpassQuery(params);
  const startedAt = Date.now();
  const response = await fetch(overpassUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': userAgent,
    },
    body: new URLSearchParams({ data: query }).toString(),
  });

  if (!response.ok) {
    logCampgroundSearch('warn', 'osm_fallback_failed', {
      reason,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return [];
  }

  const body = await response.json().catch(() => null) as { elements?: OsmElement[] } | null;
  const rows = Array.isArray(body?.elements)
    ? body.elements.map(osmElementToCampgroundRow).filter((row): row is CampgroundDbRow => !!row)
    : [];
  logCampgroundSearch('info', 'osm_fallback_result', {
    reason,
    elementCount: Array.isArray(body?.elements) ? body.elements.length : 0,
    acceptedCount: rows.length,
    durationMs: Date.now() - startedAt,
  });
  return rows;
}

async function fetchCachedCampgrounds(params: CampgroundSearchParams): Promise<CampgroundDbRow[]> {
  const { bbox, limit } = params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('campgrounds')
    .select('id, name, latitude, longitude, facility_type, managing_agency, managing_org, reservation_url, detail_url, status, availability_status, site_count, site_types, amenities, source_confidence, primary_provider, attribution, last_synced_at, last_verified_at, last_availability_checked_at')
    .neq('status', 'removed')
    .gte('longitude', bbox.minLng)
    .lte('longitude', bbox.maxLng)
    .gte('latitude', bbox.minLat)
    .lte('latitude', bbox.maxLat)
    .order('source_confidence', { ascending: false })
    .limit(Math.min(limit * 4, 1000));

  if (error) throw new Error('Unable to search established campgrounds.');
  return Array.isArray(data)
    ? (data as CampgroundDbRow[]).filter(rowHasEstablishedCampgroundIdentity)
    : [];
}

async function fetchCampgrounds(params: CampgroundSearchParams): Promise<CampgroundRowsResult> {
  try {
    const rows = await fetchCachedCampgrounds(params);
    logCampgroundSearch('info', 'cached_search_result', {
      source: 'ecs_cached_campgrounds',
      acceptedCount: rows.length,
      bbox: params.bbox,
      limit: params.limit,
    });
    if (rows.length > 0) {
      return { rows, source: 'ecs_cached_campgrounds' };
    }

    const fallbackRows = await fetchOsmFallbackCampgrounds(params, 'cache_empty');
    return fallbackRows.length > 0
      ? { rows: fallbackRows, source: 'osm_overpass_fallback', fallbackReason: 'cache_empty' }
      : { rows, source: 'ecs_cached_campgrounds' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cached campground query failed.';
    logCampgroundSearch('warn', 'cached_search_failed', {
      source: 'ecs_cached_campgrounds',
      message,
      bbox: params.bbox,
      limit: params.limit,
    });
    const fallbackRows = await fetchOsmFallbackCampgrounds(params, 'cache_error');
    if (fallbackRows.length > 0) {
      return { rows: fallbackRows, source: 'osm_overpass_fallback', fallbackReason: 'cache_error' };
    }
    throw error;
  }
}

async function fetchAvailabilityRows(campgroundIds: string[]): Promise<CampgroundAvailabilityRow[]> {
  if (!campgroundIds.length) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('campground_availability')
    .select('campground_id, provider_id, date, availability_status, available_site_count, reservable, first_come_first_served, last_checked_at, expires_at')
    .in('campground_id', campgroundIds);

  if (error) throw new Error('Unable to read campground availability.');
  return Array.isArray(data) ? (data as CampgroundAvailabilityRow[]) : [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ ok: false, error: 'GET or POST required' }, 405);

  try {
    const params = parseCampgroundSearchParams(await requestParams(req));
    if (!params) {
      return jsonResponse({
        ok: false,
        error: 'A valid bbox is required as minLng,minLat,maxLng,maxLat.',
      }, 400);
    }

    const rowsResult = await fetchCampgrounds(params);
    const rows = rowsResult.rows;
    const availabilityRows = rowsResult.source === 'ecs_cached_campgrounds'
      ? await fetchAvailabilityRows(rows.map((row) => row.id))
      : [];
    const availabilityByCampgroundId = groupAvailabilityRows(availabilityRows);
    const records = filterCampgroundSearchRows(rows, availabilityByCampgroundId, params, new Date());
    const geojson = buildCampgroundSearchFeatureCollection(records);

    return jsonResponse({
      ok: true,
      records,
      count: records.length,
      geojson,
      meta: {
        bbox: params.bbox,
        routeId: params.routeId,
        routeFilterApplied: false,
        source: rowsResult.source,
        fallbackReason: rowsResult.fallbackReason,
        featureCount: geojson.features.length,
      },
    });
  } catch (error) {
    logCampgroundSearch('error', 'search_failed', {
      message: error instanceof Error ? error.message : 'Unknown campground search failure.',
    });
    return jsonResponse({
      ok: false,
      error: 'Established campground search is temporarily unavailable. Try again after refreshing the map.',
      acceptedResultTypes: CAMPING_IDENTITY_TERMS,
    }, 503);
  }
});

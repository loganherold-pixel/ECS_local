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

type CampgroundRowsResult = {
  rows: CampgroundDbRow[];
  source: 'ecs_cached_campgrounds';
};

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
  const rows = await fetchCachedCampgrounds(params);
  logCampgroundSearch('info', 'cached_search_result', {
    source: 'ecs_cached_campgrounds',
    acceptedCount: rows.length,
    bboxProvided: true,
    limit: params.limit,
  });
  return { rows, source: 'ecs_cached_campgrounds' };
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

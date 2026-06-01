/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

function createAdminClient() {
  return createClient(
    getEnvAny(['ECS_SUPABASE_URL', 'SUPABASE_URL']),
    getEnvAny(['ECS_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function readNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanLimit(value: unknown): number {
  const limit = readNumber(value);
  if (!limit) return 200;
  return Math.max(1, Math.min(500, Math.round(limit)));
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanRouteType(value: unknown): string {
  const text = cleanText(value);
  if (
    text === 'loop' ||
    text === 'out_and_back' ||
    text === 'point_to_point' ||
    text === 'area_pack' ||
    text === 'unknown'
  ) {
    return text;
  }
  return '';
}

function cleanDifficulty(value: unknown): string {
  const text = cleanText(value);
  if (
    text === 'easy' ||
    text === 'moderate' ||
    text === 'technical' ||
    text === 'extreme' ||
    text === 'unknown'
  ) {
    return text;
  }
  return '';
}

async function requestParams(req: Request): Promise<Record<string, unknown>> {
  const url = new URL(req.url);
  const body = req.method === 'POST'
    ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
    : {};
  url.searchParams.forEach((value, key) => {
    if (body[key] == null) body[key] = value;
  });
  return body;
}

function coverageState(records: unknown[]): Record<string, string> {
  if (records.length > 0) {
    return {
      state: 'ready',
      title: 'Verified routes available',
      message: 'Source-backed ECS route catalog records match the current criteria.',
    };
  }
  return {
    state: 'no_verified_routes',
    title: 'No verified routes yet in this area',
    message: 'ECS has no source-backed route catalog records matching the current criteria. Try a wider radius or import a GPX as a private pending suggestion.',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ ok: false, error: 'GET or POST required' }, 405);

  try {
    const params = await requestParams(req);
    const limit = cleanLimit(params.limit);
    const latitude = readNumber(params.latitude ?? params.lat);
    const longitude = readNumber(params.longitude ?? params.lng ?? params.lon);
    const radiusMiles = readNumber(params.radiusMiles ?? params.radius_miles);
    const minDistanceMiles = readNumber(params.minDistanceMiles ?? params.min_distance_miles);
    const maxDistanceMiles = readNumber(params.maxDistanceMiles ?? params.max_distance_miles);
    const minDurationMinutes = readNumber(params.minDurationMinutes ?? params.min_duration_minutes);
    const maxDurationMinutes = readNumber(params.maxDurationMinutes ?? params.max_duration_minutes);
    const minConfidenceScore = readNumber(params.minConfidenceScore ?? params.min_confidence_score);
    const minRemotenessScore = readNumber(params.minRemotenessScore ?? params.min_remoteness_score);
    const maxRemotenessScore = readNumber(params.maxRemotenessScore ?? params.max_remoteness_score);
    const minCampabilityScore = readNumber(params.minCampabilityScore ?? params.min_campability_score);
    const availableFuelRangeMiles = readNumber(params.availableFuelRangeMiles ?? params.available_fuel_range_miles);
    const availableWaterCapacityGallons = readNumber(
      params.availableWaterCapacityGallons ?? params.available_water_capacity_gallons,
    );
    const routeType = cleanRouteType(params.routeType ?? params.route_type);
    const difficulty = cleanDifficulty(params.difficulty);
    const vehicleClass = cleanText(params.vehicleClass ?? params.vehicle_class);

    const admin = createAdminClient();
    let query = admin
      .from('route_catalog_public')
      .select('*')
      .eq('review_status', 'approved')
      .eq('recommendation_status', 'recommendable')
      .order('confidence_score', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (latitude != null && longitude != null && radiusMiles != null) {
      const degrees = Math.max(0.05, radiusMiles / 69);
      query = query
        .gte('center_latitude', latitude - degrees)
        .lte('center_latitude', latitude + degrees)
        .gte('center_longitude', longitude - degrees)
        .lte('center_longitude', longitude + degrees);
    }

    if (vehicleClass) {
      query = query.contains('vehicle_fit', [vehicleClass]);
    }

    if (minDistanceMiles != null) query = query.gte('distance_miles', minDistanceMiles);
    if (maxDistanceMiles != null) query = query.lte('distance_miles', maxDistanceMiles);
    if (minDurationMinutes != null) query = query.gte('estimated_duration_minutes', minDurationMinutes);
    if (maxDurationMinutes != null) query = query.lte('estimated_duration_minutes', maxDurationMinutes);
    if (minConfidenceScore != null) query = query.gte('confidence_score', minConfidenceScore);
    if (minRemotenessScore != null) query = query.gte('remoteness_score', minRemotenessScore);
    if (maxRemotenessScore != null) query = query.lte('remoteness_score', maxRemotenessScore);
    if (minCampabilityScore != null) query = query.gte('campability_score', minCampabilityScore);
    if (availableFuelRangeMiles != null && availableFuelRangeMiles > 0) {
      query = query.lte('minimum_fuel_range_miles', availableFuelRangeMiles);
    }
    if (availableWaterCapacityGallons != null && availableWaterCapacityGallons > 0) {
      query = query.lte('minimum_water_capacity_gallons', availableWaterCapacityGallons);
    }
    if (routeType) query = query.eq('route_type', routeType);
    if (difficulty) query = query.eq('difficulty', difficulty);

    const { data, error } = await query;
    if (error) throw new Error('Unable to search verified route catalog.');

    const records = Array.isArray(data) ? data : [];
    return jsonResponse({
      ok: true,
      records,
      count: records.length,
      coverageState: coverageState(records),
      meta: {
        source: 'route_catalog_public',
        recommendationOnly: true,
        bboxFilterApplied: latitude != null && longitude != null && radiusMiles != null,
        criteria: {
          minDistanceMiles,
          maxDistanceMiles,
          minDurationMinutes,
          maxDurationMinutes,
          minConfidenceScore,
          minRemotenessScore,
          maxRemotenessScore,
          minCampabilityScore,
          availableFuelRangeMiles,
          availableWaterCapacityGallons,
          routeType: routeType || null,
          difficulty: difficulty || null,
          vehicleClass: vehicleClass || null,
        },
      },
    });
  } catch (error) {
    console.error('[route-catalog-search]', {
      message: error instanceof Error ? error.message : 'Unknown route catalog search failure.',
    });
    return jsonResponse({
      ok: false,
      error: 'Verified route catalog is temporarily unavailable. No seed or mock routes are shown as verified.',
      coverageState: {
        state: 'unavailable',
        title: 'Verified route catalog unavailable',
        message: 'ECS could not reach the source-backed route catalog. No seed or mock routes are shown as verified.',
      },
    }, 503);
  }
});

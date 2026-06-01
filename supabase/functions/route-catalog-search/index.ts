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

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1' || text === 'yes') return true;
    if (text === 'false' || text === '0' || text === 'no') return false;
  }
  return fallback;
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

const ROUTE_CATALOG_SEARCH_COLUMNS = [
  'id',
  'public_id',
  'name',
  'description',
  'route_type',
  'center_latitude',
  'center_longitude',
  'distance_miles',
  'estimated_duration_minutes',
  'difficulty',
  'vehicle_fit',
  'official_access_coverage_pct',
  'unknown_access_coverage_pct',
  'restricted_access_coverage_pct',
  'active_closure_count',
  'seasonal_restriction_count',
  'vehicle_mismatch',
  'geometry_quality',
  'verification_status',
  'recommendation_status',
  'review_status',
  'confidence_score',
  'confidence_reasons',
  'warning_reasons',
  'blocker_reasons',
  'closure_summaries',
  'community_signal',
  'tags',
  'last_verified_at',
  'stale_at',
  'created_at',
  'updated_at',
  'source_records',
  'remoteness_score',
  'campability_score',
  'minimum_fuel_range_miles',
  'minimum_water_capacity_gallons',
  'route_intelligence',
];

const PREVIEW_MAX_POINTS = 120;

function searchSelect(includeGeometry: boolean, includePreviewGeometry: boolean): string {
  const columns = [...ROUTE_CATALOG_SEARCH_COLUMNS];
  if (includeGeometry || includePreviewGeometry) columns.splice(7, 0, 'route_geometry');
  return columns.join(',');
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function cleanCoordinate(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return [longitude, latitude];
  }
  return null;
}

function sampleLine(coordinates: unknown[], maxPoints: number): number[][] {
  const points = coordinates.map(cleanCoordinate).filter((point): point is number[] => !!point);
  if (points.length <= maxPoints) return points;
  if (maxPoints <= 2) return [points[0], points[points.length - 1]];

  const sampled: number[][] = [];
  const lastIndex = points.length - 1;
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
    const point = points[sourceIndex];
    const previous = sampled[sampled.length - 1];
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) sampled.push(point);
  }
  return sampled.length >= 2 ? sampled : [points[0], points[lastIndex]];
}

function simplifyGeometryForPreview(value: unknown): Record<string, unknown> | null {
  const geometry = readRecord(value);
  if (!geometry) return null;

  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    const coordinates = sampleLine(geometry.coordinates, PREVIEW_MAX_POINTS);
    return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
  }

  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    const rawLines = geometry.coordinates.filter((line): line is unknown[] => Array.isArray(line));
    const pointsPerLine = Math.max(2, Math.floor(PREVIEW_MAX_POINTS / Math.max(1, rawLines.length)));
    const coordinates = rawLines
      .map((line) => sampleLine(line, pointsPerLine))
      .filter((line) => line.length >= 2);
    return coordinates.length > 0 ? { type: 'MultiLineString', coordinates } : null;
  }

  return null;
}

function shapeSearchRecords(
  records: Record<string, unknown>[],
  includeGeometry: boolean,
  includePreviewGeometry: boolean,
): Record<string, unknown>[] {
  if (includeGeometry) {
    return records.map((record) => ({ ...record, route_geometry_mode: 'full' }));
  }

  return records.map((record) => {
    const shaped = { ...record };
    const previewGeometry = includePreviewGeometry ? simplifyGeometryForPreview(record.route_geometry) : null;
    delete shaped.route_geometry;
    if (previewGeometry) {
      shaped.route_geometry = previewGeometry;
      shaped.route_geometry_mode = 'preview_simplified';
      shaped.route_geometry_preview_max_points = PREVIEW_MAX_POINTS;
    } else {
      shaped.route_geometry_mode = 'omitted';
    }
    return shaped;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ ok: false, error: 'GET or POST required' }, 405);

  try {
    const params = await requestParams(req);
    const limit = cleanLimit(params.limit);
    const includeGeometry = readBoolean(params.includeGeometry ?? params.include_geometry, false);
    const includePreviewGeometry = readBoolean(
      params.includePreviewGeometry ?? params.include_preview_geometry,
      !includeGeometry,
    );
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
      .select(searchSelect(includeGeometry, includePreviewGeometry))
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

    const records = shapeSearchRecords(
      Array.isArray(data) ? data as Record<string, unknown>[] : [],
      includeGeometry,
      includePreviewGeometry,
    );
    return jsonResponse({
      ok: true,
      records,
      count: records.length,
      coverageState: coverageState(records),
      meta: {
        source: 'route_catalog_public',
        recommendationOnly: true,
        bboxFilterApplied: latitude != null && longitude != null && radiusMiles != null,
        geometryMode: includeGeometry ? 'full' : includePreviewGeometry ? 'preview_simplified' : 'omitted',
        previewMaxPoints: includePreviewGeometry && !includeGeometry ? PREVIEW_MAX_POINTS : null,
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

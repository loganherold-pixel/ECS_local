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

function coverageState(
  records: unknown[],
  metadata: { curationCandidateCount?: number } = {},
): Record<string, string> {
  if (records.length > 0) {
    return {
      state: 'ready',
      title: 'Verified routes available',
      message: 'Source-backed ECS route catalog records match the current criteria.',
    };
  }
  if ((metadata.curationCandidateCount ?? 0) > 0) {
    return {
      state: 'lower_confidence_nearby',
      title: 'Source-backed routes in curation',
      message: 'ECS found official or source-backed route records nearby, but none are verified enough for public recommendation under the current criteria.',
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
  'remoteness_score',
  'campability_score',
  'minimum_fuel_range_miles',
  'minimum_water_capacity_gallons',
  'route_intelligence',
];

const PREVIEW_MAX_POINTS = 120;
const ROUTE_CATALOG_RADIUS_CANDIDATE_FANOUT = 12;
const ROUTE_CATALOG_RADIUS_CANDIDATE_MIN = 250;
const ROUTE_CATALOG_RADIUS_CANDIDATE_MAX = 2000;

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

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const earthRadiusMiles = 3958.7613;
  const latitude1 = degreesToRadians(a.latitude);
  const latitude2 = degreesToRadians(b.latitude);
  const deltaLatitude = degreesToRadians(b.latitude - a.latitude);
  const deltaLongitude = degreesToRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeCenter(record: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const latitude = readNumber(record.center_latitude);
  const longitude = readNumber(record.center_longitude);
  return latitude != null && longitude != null ? { latitude, longitude } : null;
}

function withSearchDistanceMiles(
  record: Record<string, unknown>,
  center: { latitude: number; longitude: number },
): Record<string, unknown> | null {
  const route = routeCenter(record);
  if (!route) return null;
  return {
    ...record,
    search_distance_miles: Number(haversineMiles(center, route).toFixed(2)),
  };
}

function candidateLimit(limit: number, hasRadiusCriteria: boolean): number {
  if (!hasRadiusCriteria) return limit;
  return Math.min(
    ROUTE_CATALOG_RADIUS_CANDIDATE_MAX,
    Math.max(ROUTE_CATALOG_RADIUS_CANDIDATE_MIN, limit * ROUTE_CATALOG_RADIUS_CANDIDATE_FANOUT),
  );
}

function confidenceScore(record: Record<string, unknown>): number {
  return readNumber(record.confidence_score) ?? 0;
}

function updatedAtTime(record: Record<string, unknown>): number {
  const text = cleanText(record.updated_at);
  const time = text ? Date.parse(text) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function filterRecordsWithinSearchRadius(
  records: Record<string, unknown>[],
  criteria: { latitude: number | null; longitude: number | null; radiusMiles: number | null },
): { records: Record<string, unknown>[]; radiusFilterApplied: boolean; radiusMatchedCount: number } {
  const { latitude, longitude, radiusMiles } = criteria;
  if (latitude == null || longitude == null || radiusMiles == null) {
    return {
      records,
      radiusFilterApplied: false,
      radiusMatchedCount: records.length,
    };
  }

  const searchCenter = { latitude, longitude };
  const filteredRecords = records
    .map((record) => withSearchDistanceMiles(record, searchCenter))
    .filter((record): record is Record<string, unknown> =>
      !!record && readNumber(record.search_distance_miles) <= radiusMiles,
    )
    .sort((a, b) => {
      const confidenceDelta = confidenceScore(b) - confidenceScore(a);
      if (confidenceDelta !== 0) return confidenceDelta;
      const distanceDelta = (readNumber(a.search_distance_miles) ?? Number.MAX_SAFE_INTEGER) -
        (readNumber(b.search_distance_miles) ?? Number.MAX_SAFE_INTEGER);
      if (distanceDelta !== 0) return distanceDelta;
      return updatedAtTime(b) - updatedAtTime(a);
    });

  return {
    records: filteredRecords,
    radiusFilterApplied: true,
    radiusMatchedCount: filteredRecords.length,
  };
}

async function countRouteCatalogCurationCandidates(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    latitude: number | null;
    longitude: number | null;
    radiusMiles: number | null;
    queryLimit: number;
    minDistanceMiles: number | null;
    maxDistanceMiles: number | null;
    minDurationMinutes: number | null;
    maxDurationMinutes: number | null;
    minConfidenceScore: number | null;
    minRemotenessScore: number | null;
    maxRemotenessScore: number | null;
    minCampabilityScore: number | null;
    availableFuelRangeMiles: number | null;
    availableWaterCapacityGallons: number | null;
    routeType: string;
    difficulty: string;
    vehicleClass: string;
  },
): Promise<{ curationCandidateCount: number }> {
  const hasRadiusCriteria = args.latitude != null && args.longitude != null && args.radiusMiles != null;
  let query = admin
    .from('verified_routes')
    .select([
      'id',
      'center_latitude',
      'center_longitude',
      'distance_miles',
      'estimated_duration_minutes',
      'vehicle_fit',
      'recommendation_status',
      'review_status',
      'confidence_score',
      'updated_at',
      'remoteness_score',
      'campability_score',
      'minimum_fuel_range_miles',
      'minimum_water_capacity_gallons',
    ].join(','))
    .eq('review_status', 'approved')
    .neq('recommendation_status', 'recommendable')
    .order('confidence_score', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(args.queryLimit);

  if (hasRadiusCriteria) {
    const degrees = Math.max(0.05, args.radiusMiles / 69);
    query = query
      .gte('center_latitude', args.latitude - degrees)
      .lte('center_latitude', args.latitude + degrees)
      .gte('center_longitude', args.longitude - degrees)
      .lte('center_longitude', args.longitude + degrees);
  }

  if (args.vehicleClass) query = query.contains('vehicle_fit', [args.vehicleClass]);
  if (args.minDistanceMiles != null) query = query.gte('distance_miles', args.minDistanceMiles);
  if (args.maxDistanceMiles != null) query = query.lte('distance_miles', args.maxDistanceMiles);
  if (args.minDurationMinutes != null) query = query.gte('estimated_duration_minutes', args.minDurationMinutes);
  if (args.maxDurationMinutes != null) query = query.lte('estimated_duration_minutes', args.maxDurationMinutes);
  if (args.minConfidenceScore != null) query = query.gte('confidence_score', args.minConfidenceScore);
  if (args.minRemotenessScore != null) query = query.gte('remoteness_score', args.minRemotenessScore);
  if (args.maxRemotenessScore != null) query = query.lte('remoteness_score', args.maxRemotenessScore);
  if (args.minCampabilityScore != null) query = query.gte('campability_score', args.minCampabilityScore);
  if (args.availableFuelRangeMiles != null && args.availableFuelRangeMiles > 0) {
    query = query.lte('minimum_fuel_range_miles', args.availableFuelRangeMiles);
  }
  if (args.availableWaterCapacityGallons != null && args.availableWaterCapacityGallons > 0) {
    query = query.lte('minimum_water_capacity_gallons', args.availableWaterCapacityGallons);
  }
  if (args.routeType) query = query.eq('route_type', args.routeType);
  if (args.difficulty) query = query.eq('difficulty', args.difficulty);

  const { data, error } = await query;
  if (error) throw new Error('Unable to inspect route catalog curation coverage.');

  const candidates = Array.isArray(data) ? data as Record<string, unknown>[] : [];
  const radiusFiltered = filterRecordsWithinSearchRadius(candidates, {
    latitude: args.latitude,
    longitude: args.longitude,
    radiusMiles: args.radiusMiles,
  });

  return {
    curationCandidateCount: radiusFiltered.radiusMatchedCount,
  };
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

function sourceRoleRank(role: unknown): number {
  if (role === 'primary') return 0;
  if (role === 'corroborating') return 1;
  if (role === 'supplemental') return 2;
  return 3;
}

function embeddedRouteSource(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return readRecord(value[0]);
  return readRecord(value);
}

function sourceRecordFromLink(link: Record<string, unknown>, fallbackVerifiedAt: unknown): Record<string, unknown> | null {
  const source = embeddedRouteSource(link.route_sources);
  if (!source) return null;
  const sourceType = String(source.source_type || '');
  const lastVerifiedAt = link.last_verified_at || fallbackVerifiedAt || null;

  return {
    providerId: source.provider_id || '',
    provider_id: source.provider_id || '',
    sourceRole: link.source_role || '',
    source_role: link.source_role || '',
    sourceType,
    source_type: sourceType,
    label: source.name || '',
    authority: source.authority || '',
    sourceUrl: source.source_uri || null,
    source_url: source.source_uri || null,
    attribution: source.attribution || null,
    license: source.license || null,
    lastVerifiedAt,
    last_verified_at: lastVerifiedAt,
    usePermission: sourceType === 'partner_restricted' ? 'not_granted' : 'granted',
    use_permission: sourceType === 'partner_restricted' ? 'not_granted' : 'granted',
  };
}

async function attachSourceRecords(
  admin: ReturnType<typeof createAdminClient>,
  records: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const routeIds = records
    .map((record) => (typeof record.id === 'string' ? record.id : ''))
    .filter(Boolean);
  if (routeIds.length === 0) return records.map((record) => ({ ...record, source_records: [] }));

  const { data, error } = await admin
    .from('verified_route_sources')
    .select('verified_route_id,source_role,last_verified_at,route_sources(provider_id,source_type,name,authority,source_uri,attribution,license)')
    .in('verified_route_id', routeIds);
  if (error) throw new Error('Unable to attach route source attribution.');

  const recordById = new Map(records.map((record) => [String(record.id), record]));
  const sourcesByRouteId = new Map<string, Record<string, unknown>[]>();
  const links = Array.isArray(data) ? data as Record<string, unknown>[] : [];
  for (const link of links) {
    const routeId = typeof link.verified_route_id === 'string' ? link.verified_route_id : '';
    const route = recordById.get(routeId);
    if (!route) continue;
    const sourceRecord = sourceRecordFromLink(link, route.last_verified_at);
    if (!sourceRecord) continue;
    const bucket = sourcesByRouteId.get(routeId) || [];
    bucket.push(sourceRecord);
    sourcesByRouteId.set(routeId, bucket);
  }

  return records.map((record) => {
    const routeId = String(record.id || '');
    const sourceRecords = sourcesByRouteId.get(routeId) || [];
    sourceRecords.sort((left, right) =>
      sourceRoleRank(left.source_role) - sourceRoleRank(right.source_role) ||
      String(left.providerId || left.provider_id || '').localeCompare(String(right.providerId || right.provider_id || '')),
    );
    return {
      ...record,
      source_records: sourceRecords,
    };
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
    const hasRadiusCriteria = latitude != null && longitude != null && radiusMiles != null;
    const queryLimit = candidateLimit(limit, hasRadiusCriteria);

    const admin = createAdminClient();
    let query = admin
      .from('verified_routes')
      .select(searchSelect(includeGeometry, includePreviewGeometry))
      .eq('review_status', 'approved')
      .eq('recommendation_status', 'recommendable')
      .order('confidence_score', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(queryLimit);

    if (hasRadiusCriteria) {
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
    const candidates = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    const radiusFiltered = filterRecordsWithinSearchRadius(candidates, { latitude, longitude, radiusMiles });
    const limitedRecords = await attachSourceRecords(admin, radiusFiltered.records.slice(0, limit));
    const curationCoverage = await countRouteCatalogCurationCandidates(admin, {
      latitude,
      longitude,
      radiusMiles,
      queryLimit,
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
      routeType,
      difficulty,
      vehicleClass,
    });
    const anySourceBackedCandidateCount = radiusFiltered.radiusMatchedCount + curationCoverage.curationCandidateCount;

    const records = shapeSearchRecords(
      limitedRecords,
      includeGeometry,
      includePreviewGeometry,
    );
    return jsonResponse({
      ok: true,
      records,
      count: records.length,
      coverageState: coverageState(records, curationCoverage),
      meta: {
        source: 'verified_routes',
        recommendationOnly: true,
        bboxFilterApplied: hasRadiusCriteria,
        radiusFilterApplied: radiusFiltered.radiusFilterApplied,
        candidateLimit: queryLimit,
        candidateCount: candidates.length,
        radiusMatchedCount: radiusFiltered.radiusMatchedCount,
        curationCandidateCount: curationCoverage.curationCandidateCount,
        anySourceBackedCandidateCount,
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

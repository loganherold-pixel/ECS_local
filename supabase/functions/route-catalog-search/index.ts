/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { attachCurrentConditionOverlays } from '../_shared/routeCatalogCurrentConditionOverlay.ts';

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

function cleanSourceAdapter(value: unknown): string {
  const text = cleanText(value).toLowerCase();
  return /^[a-z0-9_]+$/.test(text) ? text : '';
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
const ROUTE_CATALOG_RADIUS_GEOMETRY_PADDING_MILES = 150;
const ROUTE_CATALOG_KNOWN_FEATURED_ROUTES = [
  {
    key: 'rubicon_trail',
    label: 'Rubicon Trail',
    aliases: ['rubicon', 'rubicon trail', 'the rubicon'],
    score: 100,
  },
];

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

function cleanSearchToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function recordIntelligence(record: Record<string, unknown>): Record<string, unknown> | null {
  return readRecord(record.route_intelligence ?? record.routeIntelligence);
}

function recordAliases(record: Record<string, unknown>): string[] {
  const intelligence = recordIntelligence(record);
  return unique([
    cleanText(record.name),
    cleanText(record.public_id),
    cleanText(record.id),
    ...readStringArray(record.tags),
    ...readStringArray(record.aliases),
    ...readStringArray(intelligence?.aliases),
  ]);
}

function recordHaystack(record: Record<string, unknown>): string {
  return cleanSearchToken([
    record.name,
    record.public_id,
    record.id,
    record.description,
    readStringArray(record.tags).join(' '),
    recordAliases(record).join(' '),
  ].join(' '));
}

function cleanTripType(value: unknown): string | null {
  const token = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (['day', 'day_trip', 'daytrip', 'same_day', 'single_day'].includes(token)) return 'day_trip';
  if (['overnight', 'overnight_camp', 'overnight_camping'].includes(token)) return 'overnight_camping';
  if (['weekend', 'weekend_trip', 'weekend_overland', 'two_day', 'two_day_trip'].includes(token)) return 'weekend_overland';
  if (['expedition', 'multi_day', 'multi_day_expedition', 'extended'].includes(token)) return 'multi_day_expedition';
  return null;
}

function classifyRouteCatalogTrip(record: Record<string, unknown>): Record<string, unknown> {
  const intelligence = recordIntelligence(record);
  const explicit = cleanTripType(record.trip_type ?? record.tripType ?? intelligence?.trip_type ?? intelligence?.tripType);
  const durationMinutes = readNumber(record.estimated_duration_minutes);
  const durationHours = durationMinutes != null ? durationMinutes / 60 : null;
  const distanceMiles = readNumber(record.distance_miles);
  const haystack = recordHaystack(record);
  let computed = 'day_trip';
  if (
    /\b(expedition|multi day|multi-day|extended travel)\b/.test(haystack) ||
    (durationHours != null && durationHours > 24) ||
    (distanceMiles != null && distanceMiles >= 150)
  ) {
    computed = 'multi_day_expedition';
  } else if (
    /\b(weekend|two day|2 day|overnight|requires camping|camping required)\b/.test(haystack) ||
    (durationHours != null && durationHours > 12)
  ) {
    computed = 'weekend_overland';
  }
  const tripType = explicit ?? computed;
  const estimatedDays = tripType === 'day_trip'
    ? 1
    : tripType === 'multi_day_expedition'
      ? Math.max(3, Math.ceil((durationMinutes ?? 1440) / 480))
      : Math.max(2, Math.min(3, Math.ceil((durationMinutes ?? 960) / 480)));
  const warnings = explicit && explicit !== computed
    ? [`Catalog trip type differs from computed ${computed}; keeping catalog trip type.`]
    : [];
  return {
    tripType,
    estimatedDays,
    source: explicit ? 'catalog' : 'computed',
    confidence: explicit ? 'high' : 'medium',
    reasons: [explicit ? `Catalog trip type is ${explicit}.` : `Computed trip type is ${computed}.`],
    warnings,
    computedTripType: computed,
  };
}

function coordinateFromRecord(
  record: Record<string, unknown>,
  latitudeKeys: string[],
  longitudeKeys: string[],
): { latitude: number; longitude: number } | null {
  const intelligence = recordIntelligence(record);
  for (const latKey of latitudeKeys) {
    const latitude = readNumber(record[latKey]) ?? readNumber(intelligence?.[latKey]);
    if (latitude == null) continue;
    for (const lngKey of longitudeKeys) {
      const longitude = readNumber(record[lngKey]) ?? readNumber(intelligence?.[lngKey]);
      if (longitude == null) continue;
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
    }
  }
  return null;
}

function routeTrailhead(record: Record<string, unknown>): { latitude: number; longitude: number } | null {
  const intelligence = recordIntelligence(record);
  const direct = readRecord(record.trailhead_coordinate ?? record.trailheadCoordinate ?? record.start_coordinate ?? record.startCoordinate);
  if (direct) {
    const latitude = readNumber(direct.latitude ?? direct.lat);
    const longitude = readNumber(direct.longitude ?? direct.lng ?? direct.lon);
    if (latitude != null && longitude != null) return { latitude, longitude };
  }
  const nested = readRecord(
    intelligence?.trailhead_coordinate ??
      intelligence?.trailheadCoordinate ??
      intelligence?.start_coordinate ??
      intelligence?.startCoordinate,
  );
  if (nested) {
    const latitude = readNumber(nested.latitude ?? nested.lat);
    const longitude = readNumber(nested.longitude ?? nested.lng ?? nested.lon);
    if (latitude != null && longitude != null) return { latitude, longitude };
  }
  return coordinateFromRecord(
    record,
    ['trailhead_latitude', 'trailheadLatitude', 'start_latitude', 'startLatitude', 'startLat'],
    ['trailhead_longitude', 'trailheadLongitude', 'start_longitude', 'startLongitude', 'startLng'],
  );
}

function geometryLines(record: Record<string, unknown>): Array<Array<{ latitude: number; longitude: number }>> {
  const geometry = readRecord(record.route_geometry ?? record.routeGeometry ?? record.geometry);
  if (!geometry) return [];
  const type = cleanText(geometry.type);
  const rawCoordinates = geometry.coordinates;
  if (type === 'LineString' && Array.isArray(rawCoordinates)) {
    const line = rawCoordinates
      .map(cleanCoordinate)
      .filter((point): point is number[] => !!point)
      .map(([longitude, latitude]) => ({ latitude, longitude }));
    return line.length >= 2 ? [line] : [];
  }
  if (type === 'MultiLineString' && Array.isArray(rawCoordinates)) {
    return rawCoordinates
      .filter(Array.isArray)
      .map((segment) =>
        segment
          .map(cleanCoordinate)
          .filter((point): point is number[] => !!point)
          .map(([longitude, latitude]) => ({ latitude, longitude })),
      )
      .filter((line) => line.length >= 2);
  }
  return [];
}

function pointToSegmentDistanceMiles(
  point: { latitude: number; longitude: number },
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): number {
  const milesPerDegreeLatitude = 69;
  const milesPerDegreeLongitude = 69.172 * Math.cos(degreesToRadians(point.latitude));
  const startX = (start.longitude - point.longitude) * milesPerDegreeLongitude;
  const startY = (start.latitude - point.latitude) * milesPerDegreeLatitude;
  const endX = (end.longitude - point.longitude) * milesPerDegreeLongitude;
  const endY = (end.latitude - point.latitude) * milesPerDegreeLatitude;
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.sqrt(startX * startX + startY * startY);
  const t = Math.max(0, Math.min(1, (-(startX * dx + startY * dy)) / lengthSquared));
  const nearestX = startX + t * dx;
  const nearestY = startY + t * dy;
  return Math.sqrt(nearestX * nearestX + nearestY * nearestY);
}

function geometryDistanceMiles(
  record: Record<string, unknown>,
  center: { latitude: number; longitude: number },
): number | null {
  const lines = geometryLines(record);
  let nearest = Number.POSITIVE_INFINITY;
  lines.forEach((line) => {
    for (let index = 1; index < line.length; index += 1) {
      nearest = Math.min(nearest, pointToSegmentDistanceMiles(center, line[index - 1], line[index]));
    }
  });
  return Number.isFinite(nearest) ? nearest : null;
}

function roundDistance(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(2));
}

function featuredRouteScore(record: Record<string, unknown>): number {
  const haystack = recordHaystack(record);
  let score = 0;
  ROUTE_CATALOG_KNOWN_FEATURED_ROUTES.forEach((route) => {
    if (route.aliases.some((alias) => haystack.includes(alias))) score = Math.max(score, route.score);
  });
  if (record.featured === true || recordIntelligence(record)?.featured === true || readStringArray(record.tags).some((tag) => /featured|known|iconic/i.test(tag))) {
    score = Math.max(score, 40);
  }
  return score;
}

function candidateLimit(limit: number, hasRadiusCriteria: boolean): number {
  if (!hasRadiusCriteria) return limit;
  return Math.min(
    ROUTE_CATALOG_RADIUS_CANDIDATE_MAX,
    Math.max(ROUTE_CATALOG_RADIUS_CANDIDATE_MIN, limit * ROUTE_CATALOG_RADIUS_CANDIDATE_FANOUT),
  );
}

function radiusBboxDegrees(radiusMiles: number): number {
  return Math.max(0.05, (radiusMiles + ROUTE_CATALOG_RADIUS_GEOMETRY_PADDING_MILES) / 69);
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
): {
  records: Record<string, unknown>[];
  radiusFilterApplied: boolean;
  radiusMatchedCount: number;
  geometryMatchedCount: number;
  trailheadMatchedCount: number;
  centerMatchedCount: number;
  aliasMatchedCount: number;
  featuredMatchedCount: number;
} {
  const { latitude, longitude, radiusMiles } = criteria;
  if (latitude == null || longitude == null || radiusMiles == null) {
    return {
      records: records
        .map((record) => ({
          ...record,
          search_distance_miles: null,
          geometry_distance_miles: null,
          trailhead_distance_miles: null,
          center_distance_miles: null,
          search_match_reasons: ['radius_not_applied'],
          featured_route_score: featuredRouteScore(record),
          catalog_trip_classification: classifyRouteCatalogTrip(record),
        }))
        .sort(compareDiscoveryRecords),
      radiusFilterApplied: false,
      radiusMatchedCount: records.length,
      geometryMatchedCount: 0,
      trailheadMatchedCount: 0,
      centerMatchedCount: 0,
      aliasMatchedCount: 0,
      featuredMatchedCount: 0,
    };
  }

  const searchCenter = { latitude, longitude };
  const filteredRecords = records
    .map((record) => {
      const geometryDistance = geometryDistanceMiles(record, searchCenter);
      const trailhead = routeTrailhead(record);
      const trailheadDistance = trailhead ? haversineMiles(searchCenter, trailhead) : null;
      const center = routeCenter(record);
      const centerDistance = center ? haversineMiles(searchCenter, center) : null;
      const distances = [geometryDistance, trailheadDistance, centerDistance]
        .filter((value): value is number => value != null && Number.isFinite(value));
      const matchReasons: string[] = [];
      if (geometryDistance != null && geometryDistance <= radiusMiles) matchReasons.push('geometry_within_radius');
      if (trailheadDistance != null && trailheadDistance <= radiusMiles) matchReasons.push('trailhead_within_radius');
      if (centerDistance != null && centerDistance <= radiusMiles) matchReasons.push('centroid_within_radius');
      const haystack = recordHaystack(record);
      const knownAlias = ROUTE_CATALOG_KNOWN_FEATURED_ROUTES.some((route) =>
        route.aliases.some((alias) => haystack.includes(alias))
      );
      if (knownAlias) matchReasons.push('known_route_alias');
      if (!matchReasons.some((reason) => reason.endsWith('_within_radius'))) return null;
      return {
        ...record,
        search_distance_miles: roundDistance(distances.length > 0 ? Math.min(...distances) : null),
        geometry_distance_miles: roundDistance(geometryDistance),
        trailhead_distance_miles: roundDistance(trailheadDistance),
        center_distance_miles: roundDistance(centerDistance),
        search_match_reasons: unique(matchReasons),
        featured_route_score: featuredRouteScore(record),
        catalog_trip_classification: classifyRouteCatalogTrip(record),
      };
    })
    .filter((record): record is Record<string, unknown> => !!record)
    .sort(compareDiscoveryRecords);

  return {
    records: filteredRecords,
    radiusFilterApplied: true,
    radiusMatchedCount: filteredRecords.length,
    geometryMatchedCount: filteredRecords.filter((record) =>
      readStringArray(record.search_match_reasons).includes('geometry_within_radius')
    ).length,
    trailheadMatchedCount: filteredRecords.filter((record) =>
      readStringArray(record.search_match_reasons).includes('trailhead_within_radius')
    ).length,
    centerMatchedCount: filteredRecords.filter((record) =>
      readStringArray(record.search_match_reasons).includes('centroid_within_radius')
    ).length,
    aliasMatchedCount: filteredRecords.filter((record) =>
      readStringArray(record.search_match_reasons).some((reason) =>
        reason === 'known_route_alias' || reason === 'search_term_match'
      )
    ).length,
    featuredMatchedCount: filteredRecords.filter((record) => (readNumber(record.featured_route_score) ?? 0) > 0).length,
  };
}

function compareDiscoveryRecords(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const featuredDelta = (readNumber(b.featured_route_score) ?? 0) - (readNumber(a.featured_route_score) ?? 0);
  if (featuredDelta !== 0) return featuredDelta;
  const distanceDelta = (readNumber(a.search_distance_miles) ?? Number.MAX_SAFE_INTEGER) -
    (readNumber(b.search_distance_miles) ?? Number.MAX_SAFE_INTEGER);
  if (distanceDelta !== 0) return distanceDelta;
  const confidenceDelta = confidenceScore(b) - confidenceScore(a);
  if (confidenceDelta !== 0) return confidenceDelta;
  return updatedAtTime(b) - updatedAtTime(a);
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
    const degrees = radiusBboxDegrees(args.radiusMiles);
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

function sourceMatchesSearchAdapter(sourceProviderId: unknown, sourceAdapter: string): boolean {
  const providerId = String(sourceProviderId || '').trim();
  return !!sourceAdapter && (providerId === sourceAdapter || providerId.startsWith(`${sourceAdapter}_`));
}

function recordMatchesSearchSourceAdapter(record: Record<string, unknown>, sourceAdapter: string): boolean {
  const sourceRecords = Array.isArray(record.source_records) ? record.source_records : [];
  return sourceRecords.some((source) =>
    source &&
    typeof source === 'object' &&
    sourceMatchesSearchAdapter((source as Record<string, unknown>).provider_id || (source as Record<string, unknown>).providerId, sourceAdapter),
  );
}

function filterRecordsBySourceAdapter(records: Record<string, unknown>[], sourceAdapter: string): Record<string, unknown>[] {
  if (!sourceAdapter) return records;
  return records.filter((record) => recordMatchesSearchSourceAdapter(record, sourceAdapter));
}

function expectedKnownRoutes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanSearchToken(item))
      .filter(Boolean);
  }
  const text = cleanSearchToken(value);
  return text ? [text] : [];
}

async function inspectKnownRouteDiagnostics(
  admin: ReturnType<typeof createAdminClient>,
  expectedRoutes: string[],
  matchedRecords: Record<string, unknown>[],
): Promise<Array<Record<string, unknown>>> {
  if (expectedRoutes.length === 0) return [];
  const diagnostics: Array<Record<string, unknown>> = [];
  for (const known of ROUTE_CATALOG_KNOWN_FEATURED_ROUTES) {
    const requested = known.aliases.some((alias) => expectedRoutes.includes(cleanSearchToken(alias)));
    if (!requested) continue;
    const matched = matchedRecords.some((record) =>
      known.aliases.some((alias) => recordHaystack(record).includes(alias))
    );
    if (matched) {
      diagnostics.push({
        routeKey: known.key,
        status: 'matched',
        message: `${known.label} matched the current Explore catalog query.`,
      });
      continue;
    }

    const alias = known.aliases[0];
    const slugAlias = alias.replace(/\s+/g, '-');
    const { data, error } = await admin
      .from('verified_routes')
      .select('id,public_id,name,review_status,recommendation_status')
      .or(`name.ilike.%${alias}%,public_id.ilike.%${slugAlias}%`)
      .limit(1);
    const exists = !error && Array.isArray(data) && data.length > 0;
    diagnostics.push({
      routeKey: known.key,
      status: exists ? 'present_outside_results' : 'missing_from_catalog',
      message: exists
        ? `${known.label} exists in the catalog but did not match the current radius or filters.`
        : `${known.label} is missing from the verified route catalog.`,
    });
  }
  return diagnostics;
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
    const includeCoverageDiagnostics = readBoolean(
      params.includeCoverageDiagnostics ?? params.include_coverage_diagnostics,
      true,
    );
    const skipCoverageDiagnostics = !includeCoverageDiagnostics;
    const recommendationOnly = readBoolean(params.recommendationOnly ?? params.recommendation_only, true);
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
    const sourceAdapter = cleanSourceAdapter(params.sourceAdapter ?? params.source_adapter);
    const expectedKnownRouteKeys = skipCoverageDiagnostics
      ? []
      : expectedKnownRoutes(params.expectedKnownRoutes ?? params.expected_known_routes);
    const hasRadiusCriteria = latitude != null && longitude != null && radiusMiles != null;
    const queryLimit = candidateLimit(limit, hasRadiusCriteria);

    const admin = createAdminClient();
    let query = admin
      .from('verified_routes')
      .select(searchSelect(includeGeometry, includePreviewGeometry))
      .eq('review_status', 'approved')
      .order('confidence_score', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(queryLimit);

    if (recommendationOnly) query = query.eq('recommendation_status', 'recommendable');

    if (hasRadiusCriteria) {
      const degrees = radiusBboxDegrees(radiusMiles);
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
    let limitedRecords: Record<string, unknown>[];
    let sourceMatchedCount: number | null = null;
    if (sourceAdapter) {
      const sourcedRadiusRecords = await attachSourceRecords(admin, radiusFiltered.records);
      const sourceMatchedRecords = filterRecordsBySourceAdapter(sourcedRadiusRecords, sourceAdapter);
      sourceMatchedCount = sourceMatchedRecords.length;
      limitedRecords = sourceMatchedRecords.slice(0, limit);
    } else {
      limitedRecords = await attachSourceRecords(admin, radiusFiltered.records.slice(0, limit));
    }
    const knownRouteDiagnostics = skipCoverageDiagnostics
      ? []
      : await inspectKnownRouteDiagnostics(
        admin,
        expectedKnownRouteKeys,
        sourceAdapter ? limitedRecords : radiusFiltered.records,
      );
    const curationCoverage = skipCoverageDiagnostics
      ? { curationCandidateCount: 0 }
      : await countRouteCatalogCurationCandidates(admin, {
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

    const records = attachCurrentConditionOverlays(shapeSearchRecords(
      limitedRecords,
      includeGeometry,
      includePreviewGeometry,
    ));
    return jsonResponse({
      ok: true,
      records,
      count: records.length,
      coverageState: coverageState(records, curationCoverage),
      meta: {
        source: 'verified_routes',
        recommendationOnly,
        includeCoverageDiagnostics,
        bboxFilterApplied: hasRadiusCriteria,
        radiusFilterApplied: radiusFiltered.radiusFilterApplied,
        candidateLimit: queryLimit,
        candidateCount: candidates.length,
        radiusMatchedCount: radiusFiltered.radiusMatchedCount,
        geometryMatchedCount: radiusFiltered.geometryMatchedCount,
        trailheadMatchedCount: radiusFiltered.trailheadMatchedCount,
        centerMatchedCount: radiusFiltered.centerMatchedCount,
        aliasMatchedCount: radiusFiltered.aliasMatchedCount,
        featuredMatchedCount: radiusFiltered.featuredMatchedCount,
        knownRouteDiagnostics,
        sourceAdapter: sourceAdapter || null,
        sourceFilterApplied: !!sourceAdapter,
        sourceMatchedCount,
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

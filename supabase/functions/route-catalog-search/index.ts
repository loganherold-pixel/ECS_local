/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { attachCurrentConditionOverlays } from '../_shared/routeCatalogCurrentConditionOverlay.ts';
import {
  buildSafeRouteCatalogDiagnostic,
  decodeRouteCatalogPageCursor,
  encodeRouteCatalogPageCursor,
  hasRestrictedRouteCatalogSource,
  nextRouteCatalogCandidateInspectionBatch,
  normalizeRouteCatalogPagination,
  partitionRouteCatalogRecordsByPublicEligibility,
  routeCatalogCursorFingerprint,
  selectRouteCatalogSearchResults,
  ROUTE_CATALOG_MAX_PAGINATION_WINDOW,
  type RouteCatalogPageCursor,
  type RouteCatalogSafeDiagnosticRecord,
} from './providerContract.ts';
import {
  ECS_ROUTE_CATALOG_REQUEST_ID_HEADER,
  createRouteCatalogEdgeTrace,
  resolveRouteCatalogRequestId,
  routeCatalogCorrelationResponseHeaders,
  routeCatalogResponseMetadata,
  traceNearbyRouteCatalogRpc,
  type RouteCatalogEdgeTrace,
} from './correlation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ecs-request-id',
  'Access-Control-Expose-Headers': 'x-ecs-request-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

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

const ROUTE_CATALOG_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTE_CATALOG_PAGINATION_CONTRACT_VERSION = 'route_catalog_ranked_page_v1';

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
const ROUTE_CATALOG_ID_QUERY_CHUNK_SIZE = 100;
const ROUTE_CATALOG_MAX_RADIUS_MILES = 500;
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
  // Raw geometry stays server-side for invalid-route validation before the
  // ranked public slice. shapeSearchRecords still removes it from summary
  // responses unless the caller explicitly requested full/preview geometry.
  const includeInternalEligibilityGeometry = true;
  if (includeInternalEligibilityGeometry || includeGeometry || includePreviewGeometry) {
    columns.splice(7, 0, 'route_geometry');
  }
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

type ExploreRefinement = 'remoteness' | 'dayTrip' | 'weekendTrip' | 'expedition';

const EXPLORE_DAY_TRIP_MAX_HOURS = 12;
const EXPLORE_WEEKEND_TRIP_MAX_HOURS = 24;
const EXPLORE_EXPEDITION_MIN_DISTANCE_MILES = 150;
const EXPLORE_REMOTE_TOWN_OR_SERVICE_MILES = 15;
const EXPLORE_REMOTE_PAVED_ACCESS_MILES = 8;
const EXPLORE_REFINEMENT_NESTED_RECORD_KEYS = [
  'metadata',
  'routeMetadata',
  'sourceMetadata',
  'properties',
  'assessment',
  'readiness',
  'trip',
  // Catalog operational criteria are stored here before client normalization.
  'route_intelligence',
  'routeIntelligence',
] as const;

function normalizeExploreRefinement(value: unknown): ExploreRefinement | null {
  const token = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  if (token === 'remoteness') return 'remoteness';
  if (token === 'daytrip') return 'dayTrip';
  if (token === 'weekendtrip') return 'weekendTrip';
  if (token === 'expedition') return 'expedition';
  return null;
}

function refinementCandidateRecords(record: Record<string, unknown>): Record<string, unknown>[] {
  const records = [record];
  EXPLORE_REFINEMENT_NESTED_RECORD_KEYS.forEach((key) => {
    const nested = readRecord(record[key]);
    if (nested && !records.includes(nested)) records.push(nested);
  });
  return records;
}

function refinementNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const clean = value.trim().replace(/,/g, '');
  const parsed = Number(clean);
  if (Number.isFinite(parsed)) return parsed;
  const matchedNumber = clean.match(/-?\d+(?:\.\d+)?/);
  if (!matchedNumber) return null;
  const parsedMatched = Number(matchedNumber[0]);
  return Number.isFinite(parsedMatched) ? parsedMatched : null;
}

function readRefinementNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const candidate of refinementCandidateRecords(record)) {
    for (const key of keys) {
      const value = refinementNumber(candidate[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function readRefinementBoolean(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean | null {
  for (const candidate of refinementCandidateRecords(record)) {
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === 'boolean') return value;
      if (typeof value !== 'string') continue;
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', 'required'].includes(normalized)) return true;
      if (['false', 'no', 'none', 'not required'].includes(normalized)) return false;
    }
  }
  return null;
}

function refinementSearchableText(record: Record<string, unknown>): string {
  const values: unknown[] = [];
  refinementCandidateRecords(record).forEach((candidate) => {
    values.push(
      candidate.tripMode,
      candidate.trip_mode,
      candidate.routeLabel,
      candidate.route_label,
      candidate.category,
      candidate.discoveryCategory,
      candidate.discovery_category,
      candidate.name,
      candidate.description,
    );
    if (Array.isArray(candidate.highlights)) values.push(...candidate.highlights);
    if (Array.isArray(candidate.tags)) values.push(...candidate.tags);
  });
  return values.filter(Boolean).join(' ').toLowerCase();
}

function routeDurationHoursForRefinement(record: Record<string, unknown>): number | null {
  const hours = readRefinementNumber(record, [
    'estimatedHours',
    'durationHours',
    'estimatedTravelHours',
    'estimatedDurationHours',
    'routeDurationHours',
    'travelTimeHours',
  ]);
  if (hours != null) return hours;

  const minutes = readRefinementNumber(record, [
    'estimated_duration_minutes',
    'estimatedMinutes',
    'durationMinutes',
    'estimatedDurationMinutes',
    'routeDurationMinutes',
    'travelTimeMinutes',
  ]);
  if (minutes != null) return Math.max(0.1, minutes / 60);

  const days = readRefinementNumber(record, [
    'estimatedDays',
    'durationDays',
    'routeDurationDays',
    'tripDays',
  ]);
  return days != null ? Math.max(0.1, days * EXPLORE_DAY_TRIP_MAX_HOURS) : null;
}

function routeDistanceMilesForRefinement(record: Record<string, unknown>): number | null {
  return readRefinementNumber(record, [
    'distance_miles',
    'distanceMiles',
    'routeMiles',
    'miles',
    'lengthMiles',
    'routeLengthMiles',
  ]);
}

function routeRequiresCampingForRefinement(record: Record<string, unknown>): boolean {
  const explicit = readRefinementBoolean(record, [
    'requiresCamping',
    'requires_camping',
    'campingRequired',
    'camping_required',
    'overnightRequired',
    'overnight_required',
    'requiresOvernight',
    'requires_overnight',
  ]);
  if (explicit != null) return explicit;
  return /\b(overnight|requires camping|camping required|camp required|multi-day|multi day)\b/.test(
    refinementSearchableText(record),
  );
}

function routeDurationHintForRefinement(record: Record<string, unknown>): ExploreRefinement | null {
  const searchable = refinementSearchableText(record);
  if (/\b(day trip|day-trip|short route|local route|same day|same-day|single day)\b/.test(searchable)) {
    return 'dayTrip';
  }
  if (/\b(weekend|overnight|two day|2 day|1-2 day|1 to 2 day)\b/.test(searchable)) {
    return 'weekendTrip';
  }
  if (/\b(expedition|multi-day|multi day|backcountry travel|extended travel)\b/.test(searchable)) {
    return 'expedition';
  }
  return null;
}

function normalizedExploreRemoteScore(value: unknown): number | null {
  const score = refinementNumber(value);
  if (score == null) return null;
  if (score <= 1) return score * 10;
  if (score <= 10) return score;
  return score / 10;
}

function routeIsRemoteForRefinement(record: Record<string, unknown>): boolean {
  const townOrServiceMiles = readRefinementNumber(record, [
    'distanceToNearestTownMiles',
    'nearestTownDistanceMiles',
    'nearestTownMiles',
    'distanceFromNearestTownMiles',
    'milesFromTown',
    'milesFromNearestTown',
    'distanceToNearestCityMiles',
    'nearestCityDistanceMiles',
    'distanceToNearestCommunityMiles',
    'nearestCommunityDistanceMiles',
    'distanceToNearestSettlementMiles',
    'nearestSettlementDistanceMiles',
    'distanceToNearestServicesMiles',
    'nearestServicesDistanceMiles',
    'servicesDistanceMiles',
    'nearestFuelDistanceMiles',
  ]);
  const pavedAccessMiles = readRefinementNumber(record, [
    'distanceToNearestPavedRoadMiles',
    'nearestPavedRoadDistanceMiles',
    'distanceFromPavedRoadMiles',
    'pavedRoadDistanceMiles',
    'serviceRoadDistanceMiles',
  ]);
  if (townOrServiceMiles != null || pavedAccessMiles != null) {
    return (
      (townOrServiceMiles != null && townOrServiceMiles >= EXPLORE_REMOTE_TOWN_OR_SERVICE_MILES) ||
      (pavedAccessMiles != null && pavedAccessMiles >= EXPLORE_REMOTE_PAVED_ACCESS_MILES)
    );
  }

  const remoteness = normalizedExploreRemoteScore(
    readRefinementNumber(record, ['remoteness_score', 'remotenessScore']),
  );
  if (remoteness != null) return remoteness >= 7;
  const solitude = normalizedExploreRemoteScore(
    readRefinementNumber(record, ['solitude_score', 'solitudeScore']),
  );
  if (solitude != null) return solitude >= 7;
  const popularity = readRefinementNumber(record, ['popularity_score', 'popularityScore', 'popularity']);
  if (popularity != null) {
    const normalizedPopularity = popularity <= 1 ? popularity * 100 : popularity;
    return normalizedPopularity <= 30;
  }
  if (readRefinementBoolean(record, ['hidden_gem', 'hiddenGem']) === true) return true;
  const label = cleanText(record.route_label ?? record.routeLabel).toLowerCase();
  return label.includes('remote') || label.includes('hidden gem');
}

function routeMatchesExploreRefinement(
  record: Record<string, unknown>,
  refinement: ExploreRefinement | null,
): boolean {
  if (!refinement) return true;
  if (refinement === 'remoteness') return routeIsRemoteForRefinement(record);

  const durationHours = routeDurationHoursForRefinement(record);
  const durationHint = routeDurationHintForRefinement(record);
  if (refinement === 'dayTrip') {
    if (routeRequiresCampingForRefinement(record)) return false;
    return durationHours != null
      ? durationHours <= EXPLORE_DAY_TRIP_MAX_HOURS
      : durationHint === 'dayTrip';
  }
  if (refinement === 'weekendTrip') {
    return durationHours != null
      ? durationHours > EXPLORE_DAY_TRIP_MAX_HOURS && durationHours <= EXPLORE_WEEKEND_TRIP_MAX_HOURS
      : durationHint === 'weekendTrip';
  }
  if (durationHours != null) return durationHours > EXPLORE_WEEKEND_TRIP_MAX_HOURS;
  return durationHint === 'expedition' ||
    (routeDistanceMilesForRefinement(record) ?? 0) >= EXPLORE_EXPEDITION_MIN_DISTANCE_MILES;
}

function filterRouteCatalogRecordsByExploreRefinement(
  records: Record<string, unknown>[],
  refinement: ExploreRefinement | null,
): Record<string, unknown>[] {
  if (!refinement) return records;
  return records.filter((record) => routeMatchesExploreRefinement(record, refinement));
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

function geometryLines(record: Record<string, unknown>): { latitude: number; longitude: number }[][] {
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

type RouteCatalogViewportBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

type RouteCatalogViewportFilter = {
  bbox: RouteCatalogViewportBbox;
  regionTags: string[];
};

type RouteCatalogViewportFilterResult = {
  records: Record<string, unknown>[];
  matchedCount: number;
  geometryMatchedCount: number;
  centerMatchedCount: number;
  regionMatchedCount: number;
};

const ROUTE_CATALOG_VIEWPORT_MAX_REGION_TAGS = 32;
const ROUTE_CATALOG_VIEWPORT_MAX_REGION_TAG_LENGTH = 64;

function normalizeViewportRegionToken(value: unknown): string {
  return cleanSearchToken(value).replace(/\s+/g, '_');
}

function readViewportCoordinate(value: unknown): number | null {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim().length === 0) return null;
  return readNumber(value);
}

function normalizeRouteCatalogViewportFilter(
  params: Record<string, unknown>,
): { filter: RouteCatalogViewportFilter | null; invalid: boolean } {
  const rawBbox = params.viewportBbox ?? params.viewport_bbox;
  const rawRegionTags = params.regionTags ?? params.region_tags;
  if (rawBbox == null && rawRegionTags == null) return { filter: null, invalid: false };

  const bboxRecord = readRecord(rawBbox);
  if (!bboxRecord) return { filter: null, invalid: true };
  const rawMinLng = readViewportCoordinate(bboxRecord.minLng ?? bboxRecord.min_lng ?? bboxRecord.west);
  const rawMinLat = readViewportCoordinate(bboxRecord.minLat ?? bboxRecord.min_lat ?? bboxRecord.south);
  const rawMaxLng = readViewportCoordinate(bboxRecord.maxLng ?? bboxRecord.max_lng ?? bboxRecord.east);
  const rawMaxLat = readViewportCoordinate(bboxRecord.maxLat ?? bboxRecord.max_lat ?? bboxRecord.north);
  if (
    rawMinLng == null || rawMinLat == null || rawMaxLng == null || rawMaxLat == null ||
    Math.abs(rawMinLng) > 180 || Math.abs(rawMaxLng) > 180 ||
    Math.abs(rawMinLat) > 90 || Math.abs(rawMaxLat) > 90
  ) {
    return { filter: null, invalid: true };
  }

  if (rawRegionTags != null && !Array.isArray(rawRegionTags)) {
    return { filter: null, invalid: true };
  }
  const rawTags = Array.isArray(rawRegionTags) ? rawRegionTags : [];
  if (
    rawTags.length > ROUTE_CATALOG_VIEWPORT_MAX_REGION_TAGS ||
    rawTags.some((value) => typeof value !== 'string' || value.length > ROUTE_CATALOG_VIEWPORT_MAX_REGION_TAG_LENGTH)
  ) {
    return { filter: null, invalid: true };
  }
  const regionTags = unique(rawTags.map(normalizeViewportRegionToken).filter(Boolean));
  return {
    filter: {
      bbox: {
        minLng: Math.min(rawMinLng, rawMaxLng),
        minLat: Math.min(rawMinLat, rawMaxLat),
        maxLng: Math.max(rawMinLng, rawMaxLng),
        maxLat: Math.max(rawMinLat, rawMaxLat),
      },
      regionTags,
    },
    invalid: false,
  };
}

function coordinateInViewportBbox(
  coordinate: { latitude: number; longitude: number },
  bbox: RouteCatalogViewportBbox,
): boolean {
  return coordinate.longitude >= bbox.minLng &&
    coordinate.longitude <= bbox.maxLng &&
    coordinate.latitude >= bbox.minLat &&
    coordinate.latitude <= bbox.maxLat;
}

function routeGeometryIntersectsViewportBbox(
  record: Record<string, unknown>,
  bbox: RouteCatalogViewportBbox,
): boolean {
  return geometryLines(record).some((line) => {
    const longitudes = line.map((point) => point.longitude);
    const latitudes = line.map((point) => point.latitude);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    return !(
      maxLng < bbox.minLng || minLng > bbox.maxLng ||
      maxLat < bbox.minLat || minLat > bbox.maxLat
    );
  });
}

function routeMatchesViewportRegion(
  record: Record<string, unknown>,
  regionTags: string[],
): boolean {
  if (regionTags.length === 0) return false;
  const sourceRecords = Array.isArray(record.source_records)
    ? record.source_records.map(readRecord).filter((value): value is Record<string, unknown> => !!value)
    : [];
  const routeTokens = unique([
    normalizeViewportRegionToken(record.name),
    normalizeViewportRegionToken(record.public_id ?? record.publicId),
    normalizeViewportRegionToken(record.id),
    ...readStringArray(record.tags).map(normalizeViewportRegionToken),
    ...sourceRecords.map((source) => normalizeViewportRegionToken(source.label)),
    ...sourceRecords.map((source) => normalizeViewportRegionToken(source.authority)),
  ]);
  return regionTags.some((tag) => routeTokens.includes(tag));
}

function filterRouteCatalogRecordsByViewport(
  records: Record<string, unknown>[],
  filter: RouteCatalogViewportFilter | null,
  searchArea: { latitude: number; longitude: number; radiusMiles: number } | null,
): RouteCatalogViewportFilterResult {
  if (!filter) {
    return {
      records,
      matchedCount: records.length,
      geometryMatchedCount: 0,
      centerMatchedCount: 0,
      regionMatchedCount: 0,
    };
  }

  const matched: Record<string, unknown>[] = [];
  let geometryMatchedCount = 0;
  let centerMatchedCount = 0;
  let regionMatchedCount = 0;
  records.forEach((record) => {
    if (routeGeometryIntersectsViewportBbox(record, filter.bbox)) {
      geometryMatchedCount += 1;
      matched.push(record);
      return;
    }
    const center = routeCenter(record);
    if (center && coordinateInViewportBbox(center, filter.bbox)) {
      centerMatchedCount += 1;
      matched.push(record);
      return;
    }
    if (
      center && searchArea &&
      routeMatchesViewportRegion(record, filter.regionTags) &&
      haversineMiles(
        { latitude: searchArea.latitude, longitude: searchArea.longitude },
        center,
      ) <= searchArea.radiusMiles
    ) {
      regionMatchedCount += 1;
      matched.push(record);
    }
  });
  return {
    records: matched,
    matchedCount: matched.length,
    geometryMatchedCount,
    centerMatchedCount,
    regionMatchedCount,
  };
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

function annotateIndexedRadiusPage(
  records: Record<string, unknown>[],
  criteria: { latitude: number; longitude: number; radiusMiles: number },
): ReturnType<typeof filterRecordsWithinSearchRadius> {
  const searchCenter = { latitude: criteria.latitude, longitude: criteria.longitude };
  const annotatedRecords = records.map((record) => {
    const geometryDistance = geometryDistanceMiles(record, searchCenter);
    const trailhead = routeTrailhead(record);
    const trailheadDistance = trailhead ? haversineMiles(searchCenter, trailhead) : null;
    const centerDistance = readNumber(record.center_distance_miles);
    const distances = [geometryDistance, trailheadDistance, centerDistance]
      .filter((value): value is number => value != null && Number.isFinite(value));
    const matchReasons = ['centroid_within_radius'];
    if (geometryDistance != null && geometryDistance <= criteria.radiusMiles) {
      matchReasons.push('geometry_within_radius');
    }
    if (trailheadDistance != null && trailheadDistance <= criteria.radiusMiles) {
      matchReasons.push('trailhead_within_radius');
    }
    const haystack = recordHaystack(record);
    const knownAlias = ROUTE_CATALOG_KNOWN_FEATURED_ROUTES.some((route) =>
      route.aliases.some((alias) => haystack.includes(alias))
    );
    if (knownAlias) matchReasons.push('known_route_alias');

    return {
      ...record,
      search_distance_miles: roundDistance(distances.length > 0 ? Math.min(...distances) : centerDistance),
      geometry_distance_miles: roundDistance(geometryDistance),
      trailhead_distance_miles: roundDistance(trailheadDistance),
      center_distance_miles: roundDistance(centerDistance),
      search_match_reasons: unique(matchReasons),
      featured_route_score: featuredRouteScore(record),
      catalog_trip_classification: classifyRouteCatalogTrip(record),
    };
  });

  return {
    records: annotatedRecords,
    radiusFilterApplied: true,
    radiusMatchedCount: annotatedRecords.length,
    geometryMatchedCount: annotatedRecords.filter((record) =>
      readStringArray(record.search_match_reasons).includes('geometry_within_radius')
    ).length,
    trailheadMatchedCount: annotatedRecords.filter((record) =>
      readStringArray(record.search_match_reasons).includes('trailhead_within_radius')
    ).length,
    centerMatchedCount: annotatedRecords.length,
    aliasMatchedCount: annotatedRecords.filter((record) =>
      readStringArray(record.search_match_reasons).includes('known_route_alias')
    ).length,
    featuredMatchedCount: annotatedRecords.filter((record) =>
      (readNumber(record.featured_route_score) ?? 0) > 0
    ).length,
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
  const qualityDelta =
    ((readNumber(b.campability_score) ?? 0) + (readNumber(b.remoteness_score) ?? 0)) -
    ((readNumber(a.campability_score) ?? 0) + (readNumber(a.remoteness_score) ?? 0));
  if (qualityDelta !== 0) return qualityDelta;
  const updatedAtDelta = updatedAtTime(b) - updatedAtTime(a);
  if (updatedAtDelta !== 0) return updatedAtDelta;
  const publicIdDelta = cleanText(a.public_id ?? a.publicId).localeCompare(
    cleanText(b.public_id ?? b.publicId),
  );
  if (publicIdDelta !== 0) return publicIdDelta;
  return cleanText(a.id ?? a.route_id ?? a.routeId).localeCompare(
    cleanText(b.id ?? b.route_id ?? b.routeId),
  );
}

async function inspectRouteCatalogCurationCandidates(
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
    sourceAdapter: string;
  },
): Promise<{
  curationCandidateCount: number;
  diagnosticRecords: RouteCatalogSafeDiagnosticRecord[];
}> {
  const hasRadiusCriteria = args.latitude != null && args.longitude != null && args.radiusMiles != null;
  if (hasRadiusCriteria) {
    const nearby = await fetchNearbyRouteCatalogCandidates(admin, {
      latitude: args.latitude,
      longitude: args.longitude,
      radiusMiles: args.radiusMiles,
      limit: Math.min(args.queryLimit, 50),
      pageSize: Math.min(args.queryLimit, 50),
      recommendationFilter: 'non_recommendable',
      includeGeometry: false,
      includePreviewGeometry: false,
      vehicleClass: args.vehicleClass,
      minDistanceMiles: args.minDistanceMiles,
      maxDistanceMiles: args.maxDistanceMiles,
      minDurationMinutes: args.minDurationMinutes,
      maxDurationMinutes: args.maxDurationMinutes,
      minConfidenceScore: args.minConfidenceScore,
      minRemotenessScore: args.minRemotenessScore,
      maxRemotenessScore: args.maxRemotenessScore,
      minCampabilityScore: args.minCampabilityScore,
      availableFuelRangeMiles: args.availableFuelRangeMiles,
      availableWaterCapacityGallons: args.availableWaterCapacityGallons,
      routeType: args.routeType,
      difficulty: args.difficulty,
      sourceAdapter: args.sourceAdapter,
    });
    const diagnosticCandidates = await attachSourceRecords(admin, nearby.records);
    return {
      curationCandidateCount: nearby.lookupCount,
      diagnosticRecords: diagnosticCandidates
        .map(buildSafeRouteCatalogDiagnostic)
        .filter((diagnostic): diagnostic is RouteCatalogSafeDiagnosticRecord => !!diagnostic),
    };
  }
  let query = admin
    .from('verified_routes')
    .select([
      'id',
      'public_id',
      'name',
      'center_latitude',
      'center_longitude',
      'distance_miles',
      'estimated_duration_minutes',
      'vehicle_fit',
      'route_type',
      'geometry_quality',
      'verification_status',
      'official_access_coverage_pct',
      'unknown_access_coverage_pct',
      'restricted_access_coverage_pct',
      'active_closure_count',
      'seasonal_restriction_count',
      'vehicle_mismatch',
      'blocker_reasons',
      'warning_reasons',
      'stale_at',
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
  const diagnosticCandidates = await attachSourceRecords(
    admin,
    radiusFiltered.records.slice(0, 50),
  );
  const diagnosticRecords = diagnosticCandidates
    .map(buildSafeRouteCatalogDiagnostic)
    .filter((diagnostic): diagnostic is RouteCatalogSafeDiagnosticRecord => !!diagnostic);

  return {
    curationCandidateCount: radiusFiltered.radiusMatchedCount,
    diagnosticRecords,
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
  // Defense in depth: restricted partner rows are partitioned before this
  // function. If a future caller bypasses that partition, geometry still does
  // not cross the Edge serialization boundary.
  const publishableRecords = records.filter((record) => !hasRestrictedRouteCatalogSource(record));
  if (includeGeometry) {
    return publishableRecords.map((record) => ({ ...record, route_geometry_mode: 'full' }));
  }

  return publishableRecords.map((record) => {
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
): Promise<Record<string, unknown>[]> {
  if (expectedRoutes.length === 0) return [];
  const diagnostics: Record<string, unknown>[] = [];
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

  const linkBatches = await Promise.all(
    chunkRouteIds(routeIds).map(async (routeIdBatch) => {
      const { data, error } = await admin
        .from('verified_route_sources')
        .select('verified_route_id,source_role,last_verified_at,route_sources(provider_id,source_type,name,authority,source_uri,attribution,license)')
        .in('verified_route_id', routeIdBatch);
      if (error) throw new Error('Unable to attach route source attribution.');
      return Array.isArray(data) ? data as Record<string, unknown>[] : [];
    }),
  );

  const recordById = new Map(records.map((record) => [String(record.id), record]));
  const sourcesByRouteId = new Map<string, Record<string, unknown>[]>();
  const links = linkBatches.flat();
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

type NearbyRouteCatalogSearchArgs = {
  trace?: RouteCatalogEdgeTrace | null;
  latitude: number;
  longitude: number;
  radiusMiles: number;
  offset?: number;
  limit: number;
  pageSize: number;
  publicPage?: boolean;
  cursorPage?: boolean;
  continuationCursor?: RouteCatalogPageCursor | null;
  cursorFingerprint?: string;
  cursorSigningSecret?: string;
  recommendationFilter: 'recommendable' | 'non_recommendable' | 'all';
  includeGeometry: boolean;
  includePreviewGeometry: boolean;
  vehicleClass: string;
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
  sourceAdapter: string;
};

function chunkRouteIds(routeIds: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < routeIds.length; index += ROUTE_CATALOG_ID_QUERY_CHUNK_SIZE) {
    chunks.push(routeIds.slice(index, index + ROUTE_CATALOG_ID_QUERY_CHUNK_SIZE));
  }
  return chunks;
}

async function fetchNearbyRouteCatalogCandidates(
  admin: ReturnType<typeof createAdminClient>,
  args: NearbyRouteCatalogSearchArgs,
): Promise<{
  records: Record<string, unknown>[];
  lookupCount: number;
  lookupBounded: boolean;
  nextCursor: string | null;
}> {
  const rpcArguments = {
      p_latitude: args.latitude,
      p_longitude: args.longitude,
      p_radius_miles: args.radiusMiles,
      p_limit: args.limit,
      p_recommendation_filter: args.recommendationFilter,
      p_vehicle_class: args.vehicleClass || null,
      p_min_distance_miles: args.minDistanceMiles,
      p_max_distance_miles: args.maxDistanceMiles,
      p_min_duration_minutes: args.minDurationMinutes,
      p_max_duration_minutes: args.maxDurationMinutes,
      p_min_confidence_score: args.minConfidenceScore,
      p_min_remoteness_score: args.minRemotenessScore,
      p_max_remoteness_score: args.maxRemotenessScore,
      p_min_campability_score: args.minCampabilityScore,
      p_available_fuel_range_miles: args.availableFuelRangeMiles,
      p_available_water_capacity_gallons: args.availableWaterCapacityGallons,
      p_route_type: args.routeType || null,
      p_difficulty: args.difficulty || null,
      p_source_adapter: args.sourceAdapter || null,
  };
  const cursorArguments = args.cursorPage
    ? {
        ...rpcArguments,
        p_cursor_route_id: args.continuationCursor?.routeId ?? null,
      }
    : null;
  const { data: nearbyData, error: nearbyError } = await traceNearbyRouteCatalogRpc(
    args.trace,
    () => admin.rpc(
      args.cursorPage
        ? 'route_catalog_nearby_public_route_cursor_page'
        : args.publicPage
          ? 'route_catalog_nearby_public_route_page'
          : 'route_catalog_nearby_route_ids',
      cursorArguments ?? (args.publicPage
        ? { ...rpcArguments, p_offset: Math.max(0, Math.floor(args.offset ?? 0)) }
        : rpcArguments),
    ),
  );
  if (nearbyError) throw new Error('Unable to search the indexed nearby route catalog.');

  const nearbyRows = Array.isArray(nearbyData)
    ? nearbyData
        .map(readRecord)
        .filter((row): row is Record<string, unknown> => !!row)
    : [];
  const orderedRouteIds = unique(
    nearbyRows
      .map((row) => cleanText(row.route_id ?? row.routeId))
      .filter(Boolean),
  );
  const lookupBounded = nearbyRows.length >= args.limit;
  const inspectedRouteIds = orderedRouteIds.slice(0, Math.max(1, Math.floor(args.pageSize)));
  const cursorRow = lookupBounded
    ? nearbyRows[Math.max(0, Math.min(args.pageSize, nearbyRows.length) - 1)]
    : null;
  const cursorRouteId = cleanText(cursorRow?.cursor_route_id ?? cursorRow?.cursorRouteId);
  const nextCursor =
    args.cursorPage &&
    args.cursorFingerprint &&
    args.cursorSigningSecret &&
    ROUTE_CATALOG_UUID_PATTERN.test(cursorRouteId)
      ? await encodeRouteCatalogPageCursor({
          routeId: cursorRouteId,
        }, args.cursorFingerprint, args.cursorSigningSecret)
      : null;
  if (inspectedRouteIds.length === 0) {
    return { records: [], lookupCount: 0, lookupBounded: false, nextCursor: null };
  }

  const recordBatches = await Promise.all(
    chunkRouteIds(inspectedRouteIds).map(async (routeIds) => {
      let query = admin
        .from('verified_routes')
        .select(searchSelect(args.includeGeometry, args.includePreviewGeometry))
        .in('id', routeIds)
        .eq('review_status', 'approved');
      if (args.recommendationFilter === 'recommendable') {
        query = query.eq('recommendation_status', 'recommendable');
      } else if (args.recommendationFilter === 'non_recommendable') {
        query = query.neq('recommendation_status', 'recommendable');
      }
      const { data, error } = await query;
      if (error) throw new Error('Unable to load nearby route catalog summaries.');
      return Array.isArray(data) ? data as Record<string, unknown>[] : [];
    }),
  );
  const distanceByRouteId = new Map(
    nearbyRows.map((row) => [
      cleanText(row.route_id ?? row.routeId),
      readNumber(row.center_distance_miles ?? row.centerDistanceMiles),
    ]),
  );
  const recordsById = new Map(
    recordBatches
      .flat()
      .map((record) => [cleanText(record.id), record] as const),
  );
  const records = inspectedRouteIds.flatMap((routeId) => {
    const record = recordsById.get(routeId);
    if (!record) return [];
    return [{
      ...record,
      center_distance_miles: distanceByRouteId.get(routeId) ?? null,
    }];
  });
  return {
    records,
    lookupCount: inspectedRouteIds.length,
    lookupBounded,
    nextCursor,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const requestId = resolveRouteCatalogRequestId(
    req.headers.get(ECS_ROUTE_CATALOG_REQUEST_ID_HEADER),
  );
  const trace = createRouteCatalogEdgeTrace({ requestId });
  let responseCandidateCount = 0;
  let responseReturnedCount = 0;
  let responseBlockedCount = 0;
  const completeResponse = (body: Record<string, unknown>, status = 200): Response => {
    const responseBody = routeCatalogResponseMetadata(body, requestId);
    trace.emit('response_complete', {
      candidateCount: responseCandidateCount,
      returnedCount: responseReturnedCount,
      blockedCount: responseBlockedCount,
      rpcUsed: trace.nearbyRpcStarted,
      durationMs: trace.now() - trace.startedAtMs,
    });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: routeCatalogCorrelationResponseHeaders(corsHeaders, requestId),
    });
  };
  trace.emit('request_start', {
    candidateCount: 0,
    returnedCount: 0,
    blockedCount: 0,
    rpcUsed: false,
    durationMs: 0,
  });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return completeResponse({ ok: false, error: 'GET or POST required' }, 405);
  }

  try {
    const params = await requestParams(req);
    const pagination = normalizeRouteCatalogPagination(params);
    const { page, pageSize, offset, windowExceeded } = pagination;
    if (windowExceeded) {
      return completeResponse({
        ok: false,
        error: `Requested route catalog page exceeds the bounded ${ROUTE_CATALOG_MAX_PAGINATION_WINDOW}-record search window.`,
        safeErrorCode: 'ROUTE_CATALOG_PAGINATION_WINDOW_EXCEEDED',
      }, 400);
    }
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
    const hasAnyRadiusCriterion = latitude != null || longitude != null || radiusMiles != null;
    const hasValidRadiusCriteria =
      latitude != null &&
      longitude != null &&
      radiusMiles != null &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180 &&
      radiusMiles > 0 &&
      radiusMiles <= ROUTE_CATALOG_MAX_RADIUS_MILES;
    if (hasAnyRadiusCriterion && !hasValidRadiusCriteria) {
      return completeResponse({
        ok: false,
        error: `Latitude, longitude, and a radius from 0 to ${ROUTE_CATALOG_MAX_RADIUS_MILES} miles are required together.`,
        safeErrorCode: 'ROUTE_CATALOG_INVALID_SEARCH_AREA',
      }, 400);
    }
    const viewportFilterResolution = normalizeRouteCatalogViewportFilter(params);
    if (viewportFilterResolution.invalid || (viewportFilterResolution.filter && !hasValidRadiusCriteria)) {
      return completeResponse({
        ok: false,
        error: 'A valid viewport bounding box, optional region tags, and valid radius search area are required together.',
        safeErrorCode: 'ROUTE_CATALOG_INVALID_VIEWPORT',
      }, 400);
    }
    const viewportFilter = viewportFilterResolution.filter;
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
    const exploreRefinement = normalizeExploreRefinement(
      params.exploreRefinement ?? params.explore_refinement,
    );
    const expectedKnownRouteKeys = skipCoverageDiagnostics
      ? []
      : expectedKnownRoutes(params.expectedKnownRoutes ?? params.expected_known_routes);
    const hasRadiusCriteria = hasValidRadiusCriteria;
    const cursorFingerprint = await routeCatalogCursorFingerprint([
      latitude,
      longitude,
      radiusMiles,
      recommendationOnly,
      vehicleClass || null,
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
      routeType || null,
      difficulty || null,
      sourceAdapter || null,
      exploreRefinement,
      viewportFilter
        ? [
            viewportFilter.bbox.minLng,
            viewportFilter.bbox.minLat,
            viewportFilter.bbox.maxLng,
            viewportFilter.bbox.maxLat,
            viewportFilter.regionTags,
          ]
        : null,
    ]);
    const cursorSigningSecret = getEnvAny(['ECS_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
    const useCursorPage = hasRadiusCriteria && recommendationOnly;
    const admin = createAdminClient();
    let candidates: Record<string, unknown>[] = [];
    let nearbyLookupCount = 0;
    let nearbyLookupBounded = false;
    let internalNextCursor: string | null = null;
    let candidateQueryBounded = false;
    let candidateBatchLimit: number | null = null;

    // Inspect the complete bounded candidate window before filtering, ranking,
    // deduping, and selecting the requested public page. The nearby RPC cursor
    // remains internal; the consumer contract uses deterministic page/offset
    // continuation over the ranked revealable set.
    if (hasRadiusCriteria) {
      let internalContinuationCursor: RouteCatalogPageCursor | null = null;
      let internalOffset = 0;
      while (nearbyLookupCount < ROUTE_CATALOG_MAX_PAGINATION_WINDOW) {
        const batch = nextRouteCatalogCandidateInspectionBatch(nearbyLookupCount);
        if (!batch) break;
        const batchPageSize = batch.pageSize;
        const batchQueryLimit = batch.queryLimit;
        candidateBatchLimit = batchQueryLimit;
        const nearby = await fetchNearbyRouteCatalogCandidates(admin, {
          trace,
          latitude,
          longitude,
          radiusMiles,
          offset: internalOffset,
          limit: batchQueryLimit,
          pageSize: batchPageSize,
          publicPage: true,
          cursorPage: useCursorPage,
          continuationCursor: internalContinuationCursor,
          cursorFingerprint,
          cursorSigningSecret,
          recommendationFilter: recommendationOnly ? 'recommendable' : 'all',
          includeGeometry,
          includePreviewGeometry,
          vehicleClass,
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
          sourceAdapter,
        });
        candidates.push(...nearby.records);
        nearbyLookupCount += nearby.lookupCount;
        nearbyLookupBounded = nearby.lookupBounded;
        internalNextCursor = nearby.nextCursor;
        if (!nearbyLookupBounded) break;
        if (nearbyLookupCount >= ROUTE_CATALOG_MAX_PAGINATION_WINDOW) break;
        if (useCursorPage) {
          internalContinuationCursor = await decodeRouteCatalogPageCursor(
            internalNextCursor,
            cursorFingerprint,
            cursorSigningSecret,
          );
          if (!internalContinuationCursor) {
            throw new Error('Unable to continue internal route catalog candidate inspection.');
          }
        } else {
          internalOffset += nearby.lookupCount;
        }
      }
      candidateQueryBounded = nearbyLookupBounded;
    } else {
      let query = admin
        .from('verified_routes')
        .select(searchSelect(includeGeometry, includePreviewGeometry))
        .eq('review_status', 'approved')
        .order('confidence_score', { ascending: false })
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(ROUTE_CATALOG_MAX_PAGINATION_WINDOW);

      if (recommendationOnly) query = query.eq('recommendation_status', 'recommendable');
      if (vehicleClass) query = query.contains('vehicle_fit', [vehicleClass]);
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
      candidates = Array.isArray(data) ? data as Record<string, unknown>[] : [];
      candidateQueryBounded = candidates.length >= ROUTE_CATALOG_MAX_PAGINATION_WINDOW;
    }

    responseCandidateCount = candidates.length;
    const radiusFiltered = hasRadiusCriteria
      ? annotateIndexedRadiusPage(candidates, { latitude, longitude, radiusMiles })
      : filterRecordsWithinSearchRadius(candidates, { latitude, longitude, radiusMiles });
    const sourcedRadiusRecords = await attachSourceRecords(admin, radiusFiltered.records);
    const sourceEligibleRecords = sourceAdapter
      ? filterRecordsBySourceAdapter(sourcedRadiusRecords, sourceAdapter)
      : sourcedRadiusRecords;
    const sourceMatchedCount = sourceAdapter ? sourceEligibleRecords.length : null;
    // Apply the same public eligibility vocabulary used by the production
    // client over the complete inspected pool. Access, moderation, current
    // condition, source safety/identity/freshness, vehicle, supported-format,
    // and geometry failures must not consume one of the ranked 20 slots.
    const publicEligibilityPartition = partitionRouteCatalogRecordsByPublicEligibility(
      attachCurrentConditionOverlays(sourceEligibleRecords),
      { includeGeometry, includePreviewGeometry },
    );
    // A map viewport is a semantic search filter, not a post-response display
    // filter. Apply it to the complete internally inspected eligible pool so
    // higher-ranked routes outside the viewport cannot consume the public 20.
    const viewportEligiblePartition = filterRouteCatalogRecordsByViewport(
      publicEligibilityPartition.records,
      viewportFilter,
      hasRadiusCriteria
        ? { latitude: latitude!, longitude: longitude!, radiusMiles: radiusMiles! }
        : null,
    );
    const refinementEligibleRecords = filterRouteCatalogRecordsByExploreRefinement(
      viewportEligiblePartition.records,
      exploreRefinement,
    );
    const selectedRefinementResults = selectRouteCatalogSearchResults(
      refinementEligibleRecords,
      {
        offset,
        pageSize,
        compareRecords: compareDiscoveryRecords,
      },
    );
    const resultSelection = {
      ...selectedRefinementResults,
      diagnosticRecords: [
        ...publicEligibilityPartition.diagnosticRecords,
        ...selectedRefinementResults.diagnosticRecords,
      ],
    };
    const limitedRecords = resultSelection.records;
    let knownRouteDiagnostics: Record<string, unknown>[] = [];
    let curationCoverage = {
      curationCandidateCount: 0,
      diagnosticRecords: [] as RouteCatalogSafeDiagnosticRecord[],
    };
    let coverageDiagnosticsUnavailable = false;
    // Coverage diagnostics are explanatory only. They must not delay or erase
    // valid public summaries, and any provider failure remains fail-soft.
    if (!skipCoverageDiagnostics && limitedRecords.length === 0) {
      try {
        knownRouteDiagnostics = await inspectKnownRouteDiagnostics(
          admin,
          expectedKnownRouteKeys,
          refinementEligibleRecords,
        );
        curationCoverage = await inspectRouteCatalogCurationCandidates(admin, {
          latitude,
          longitude,
          radiusMiles,
          queryLimit: ROUTE_CATALOG_MAX_PAGINATION_WINDOW,
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
          sourceAdapter,
        });
      } catch {
        coverageDiagnosticsUnavailable = true;
      }
    }
    const matchedCount = resultSelection.revealableMatchedCount;
    const anySourceBackedCandidateCount = matchedCount + curationCoverage.curationCandidateCount;

    const records = shapeSearchRecords(
      limitedRecords,
      includeGeometry,
      includePreviewGeometry,
    );
    const diagnosticRecordsByRouteId = new Map<string, RouteCatalogSafeDiagnosticRecord>();
    [...resultSelection.diagnosticRecords, ...curationCoverage.diagnosticRecords].forEach((diagnostic) => {
      const existing = diagnosticRecordsByRouteId.get(diagnostic.routeId);
      diagnosticRecordsByRouteId.set(diagnostic.routeId, existing
        ? {
            ...existing,
            exclusionReasons: Array.from(new Set([
              ...existing.exclusionReasons,
              ...diagnostic.exclusionReasons,
            ])),
            sourceTypes: Array.from(new Set([...existing.sourceTypes, ...diagnostic.sourceTypes])),
          }
        : diagnostic);
    });
    const diagnosticRecords = Array.from(diagnosticRecordsByRouteId.values()).slice(0, 50);
    const diagnosticCandidateCount = curationCoverage.curationCandidateCount
      + resultSelection.diagnosticRecords.length;
    const hasMore = resultSelection.hasMoreRevealable;
    const additionalMatchesAvailable = hasMore;
    const totalMatchedCountBounded = candidateQueryBounded;
    responseCandidateCount = candidates.length;
    responseReturnedCount = records.length;
    responseBlockedCount = diagnosticRecords.length;
    return completeResponse({
      ok: true,
      records,
      diagnosticRecords,
      count: records.length,
      coverageState: coverageState(records, { curationCandidateCount: diagnosticCandidateCount }),
      meta: {
        source: 'verified_routes',
        paginationContractVersion: ROUTE_CATALOG_PAGINATION_CONTRACT_VERSION,
        nearbyRouteRpcUsed: hasRadiusCriteria,
        nearbyRouteRpc: hasRadiusCriteria
          ? useCursorPage
            ? 'route_catalog_nearby_public_route_cursor_page'
            : 'route_catalog_nearby_public_route_page'
          : null,
        fallbackQueryUsed: !hasRadiusCriteria,
        recommendationOnly,
        includeCoverageDiagnostics,
        bboxFilterApplied: useCursorPage,
        semanticViewportFilterApplied: viewportFilter != null,
        viewportBboxFilterApplied: viewportFilter != null,
        viewportRegionFilterApplied: (viewportFilter?.regionTags.length ?? 0) > 0,
        viewportRegionTagCount: viewportFilter?.regionTags.length ?? 0,
        viewportMatchedCount: viewportEligiblePartition.matchedCount,
        viewportGeometryMatchedCount: viewportEligiblePartition.geometryMatchedCount,
        viewportCenterMatchedCount: viewportEligiblePartition.centerMatchedCount,
        viewportRegionMatchedCount: viewportEligiblePartition.regionMatchedCount,
        spatialIndexFilterApplied: hasRadiusCriteria,
        radiusFilterApplied: radiusFiltered.radiusFilterApplied,
        candidateLimit: ROUTE_CATALOG_MAX_PAGINATION_WINDOW,
        candidateBatchLimit,
        candidateCount: candidates.length,
        spatialIndexCandidateCount: hasRadiusCriteria ? nearbyLookupCount : 0,
        radiusMatchedCount: radiusFiltered.radiusMatchedCount,
        geometryMatchedCount: radiusFiltered.geometryMatchedCount,
        trailheadMatchedCount: radiusFiltered.trailheadMatchedCount,
        centerMatchedCount: radiusFiltered.centerMatchedCount,
        aliasMatchedCount: radiusFiltered.aliasMatchedCount,
        featuredMatchedCount: radiusFiltered.featuredMatchedCount,
        knownRouteDiagnostics,
        coverageDiagnosticsUnavailable,
        sourceAdapter: sourceAdapter || null,
        sourceFilterApplied: !!sourceAdapter,
        sourceMatchedCount,
        exploreRefinement,
        refinementFilterApplied: exploreRefinement != null,
        refinementMatchedCount: refinementEligibleRecords.length,
        curationCandidateCount: diagnosticCandidateCount,
        safeDiagnosticCount: diagnosticRecords.length,
        anySourceBackedCandidateCount,
        page,
        pageSize,
        offset,
        resultLimit: resultSelection.resultLimit,
        additionalMatchesAvailable,
        returnedCount: records.length,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
        nextCursor: null,
        totalMatchedCount: matchedCount,
        totalMatchedCountBounded,
        maxPaginationWindow: ROUTE_CATALOG_MAX_PAGINATION_WINDOW,
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
          exploreRefinement,
          semanticViewportFilterApplied: viewportFilter != null,
          viewportRegionTagCount: viewportFilter?.regionTags.length ?? 0,
        },
      },
    });
  } catch {
    return completeResponse({
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

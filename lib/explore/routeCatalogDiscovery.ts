export type RouteCatalogDiscoveryCoordinate = {
  latitude: number;
  longitude: number;
};

export type RouteCatalogDiscoveryTripType =
  | 'day_trip'
  | 'overnight_camping'
  | 'weekend_overland'
  | 'multi_day_expedition'
  | 'unknown';

export type RouteCatalogTripClassification = {
  tripType: RouteCatalogDiscoveryTripType;
  estimatedDays: number;
  source: 'catalog' | 'computed' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  warnings: string[];
  computedTripType?: RouteCatalogDiscoveryTripType;
};

export type RouteCatalogDiscoveryQuery = {
  latitude?: number | null;
  longitude?: number | null;
  radiusMiles?: number | null;
  limit?: number | null;
  regionTags?: string[] | null;
  searchTerms?: string[] | null;
  expectedKnownRoutes?: string[] | null;
};

export type RouteCatalogKnownRouteDiagnostic = {
  routeKey: string;
  status: 'matched' | 'present_outside_results' | 'missing_from_catalog';
  message: string;
};

export type RouteCatalogDiscoveryRecord = Record<string, unknown> & {
  search_distance_miles: number | null;
  geometry_distance_miles: number | null;
  trailhead_distance_miles: number | null;
  center_distance_miles: number | null;
  search_match_reasons: string[];
  featured_route_score: number;
  catalog_trip_classification: RouteCatalogTripClassification;
};

export type RouteCatalogDiscoveryResult = {
  records: RouteCatalogDiscoveryRecord[];
  allMatchedRecords: RouteCatalogDiscoveryRecord[];
  radiusFilterApplied: boolean;
  matchedCount: number;
  geometryMatchedCount: number;
  trailheadMatchedCount: number;
  centerMatchedCount: number;
  aliasMatchedCount: number;
  featuredMatchedCount: number;
  knownRouteDiagnostics: RouteCatalogKnownRouteDiagnostic[];
};

const EARTH_RADIUS_MILES = 3958.7613;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;
const DAY_TRIP_MAX_HOURS = 12;
const WEEKEND_TRIP_MAX_HOURS = 24;
const EXPEDITION_MIN_DISTANCE_MILES = 150;

const KNOWN_FEATURED_ROUTES = [
  {
    key: 'rubicon_trail',
    label: 'Rubicon Trail',
    aliases: ['rubicon', 'rubicon trail', 'the rubicon'],
    score: 100,
  },
] as const;

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim().replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readFirstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  const intelligence = readRecord(record.route_intelligence ?? record.routeIntelligence);
  for (const key of keys) {
    const direct = finiteNumber(record[key]);
    if (direct != null) return direct;
    const nested = intelligence ? finiteNumber(intelligence[key]) : null;
    if (nested != null) return nested;
  }
  return null;
}

function readFirstText(record: Record<string, unknown>, keys: string[]): string {
  const intelligence = readRecord(record.route_intelligence ?? record.routeIntelligence);
  for (const key of keys) {
    const direct = cleanText(record[key]);
    if (direct) return direct;
    const nested = intelligence ? cleanText(intelligence[key]) : '';
    if (nested) return nested;
  }
  return '';
}

function routeName(record: Record<string, unknown>): string {
  return readFirstText(record, ['name', 'title', 'route_name', 'routeName']);
}

function routeId(record: Record<string, unknown>): string {
  return readFirstText(record, ['public_id', 'publicId', 'route_slug', 'routeSlug', 'id']);
}

function routeTags(record: Record<string, unknown>): string[] {
  return readStringArray(record.tags);
}

function routeAliases(record: Record<string, unknown>): string[] {
  const intelligence = readRecord(record.route_intelligence ?? record.routeIntelligence);
  return unique([
    routeName(record),
    routeId(record),
    ...routeTags(record),
    ...readStringArray(record.aliases),
    ...readStringArray(record.route_aliases ?? record.routeAliases),
    ...(intelligence ? readStringArray(intelligence.aliases ?? intelligence.routeAliases ?? intelligence.route_aliases) : []),
  ]);
}

function routeSearchHaystack(record: Record<string, unknown>): string {
  return normalizeSearchText([
    routeName(record),
    routeId(record),
    cleanText(record.description),
    routeTags(record).join(' '),
    routeAliases(record).join(' '),
  ].join(' '));
}

function normalizeLimit(value: unknown): number {
  const limit = finiteNumber(value);
  if (limit == null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.round(limit)));
}

function roundDistance(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(2));
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceMilesBetween(
  a: RouteCatalogDiscoveryCoordinate,
  b: RouteCatalogDiscoveryCoordinate,
): number {
  const latitude1 = degreesToRadians(a.latitude);
  const latitude2 = degreesToRadians(b.latitude);
  const deltaLatitude = degreesToRadians(b.latitude - a.latitude);
  const deltaLongitude = degreesToRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizeCoordinatePair(value: unknown): RouteCatalogDiscoveryCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = finiteNumber(value[0]);
  const latitude = finiteNumber(value[1]);
  if (latitude == null || longitude == null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function coordinateFromRecord(
  record: Record<string, unknown>,
  coordinateKeys: string[],
  latitudeKeys: string[],
  longitudeKeys: string[],
): RouteCatalogDiscoveryCoordinate | null {
  const intelligence = readRecord(record.route_intelligence ?? record.routeIntelligence);
  for (const key of coordinateKeys) {
    const directRecord = readRecord(record[key]);
    const direct = directRecord
      ? coordinateFromRecord(directRecord, [], ['latitude', 'lat'], ['longitude', 'lng', 'lon'])
      : normalizeCoordinatePair(record[key]);
    if (direct) return direct;

    const nestedValue = intelligence ? intelligence[key] : undefined;
    const nestedRecord = readRecord(nestedValue);
    const nested = nestedRecord
      ? coordinateFromRecord(nestedRecord, [], ['latitude', 'lat'], ['longitude', 'lng', 'lon'])
      : normalizeCoordinatePair(nestedValue);
    if (nested) return nested;
  }

  for (const latKey of latitudeKeys) {
    const latitude = readFirstNumber(record, [latKey]);
    if (latitude == null) continue;
    for (const lngKey of longitudeKeys) {
      const longitude = readFirstNumber(record, [lngKey]);
      if (longitude == null) continue;
      if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        return { latitude, longitude };
      }
    }
  }
  return null;
}

export function routeCatalogRecordCenter(record: Record<string, unknown>): RouteCatalogDiscoveryCoordinate | null {
  return coordinateFromRecord(
    record,
    ['center_coordinate', 'centerCoordinate'],
    ['center_latitude', 'centerLatitude', 'latitude', 'lat'],
    ['center_longitude', 'centerLongitude', 'longitude', 'lng', 'lon'],
  );
}

export function routeCatalogRecordTrailhead(record: Record<string, unknown>): RouteCatalogDiscoveryCoordinate | null {
  return coordinateFromRecord(
    record,
    ['trailhead_coordinate', 'trailheadCoordinate', 'start_coordinate', 'startCoordinate'],
    ['trailhead_latitude', 'trailheadLatitude', 'start_latitude', 'startLatitude', 'startLat'],
    ['trailhead_longitude', 'trailheadLongitude', 'start_longitude', 'startLongitude', 'startLng'],
  );
}

function geometryLines(record: Record<string, unknown>): RouteCatalogDiscoveryCoordinate[][] {
  const geometry = readRecord(record.route_geometry ?? record.routeGeometry ?? record.geometry);
  if (!geometry) return [];
  const type = cleanText(geometry.type);
  const coordinates = geometry.coordinates;
  if (type === 'LineString' && Array.isArray(coordinates)) {
    const line = coordinates
      .map(normalizeCoordinatePair)
      .filter((point): point is RouteCatalogDiscoveryCoordinate => !!point);
    return line.length >= 2 ? [line] : [];
  }
  if (type === 'MultiLineString' && Array.isArray(coordinates)) {
    return coordinates
      .filter(Array.isArray)
      .map((segment) =>
        segment
          .map(normalizeCoordinatePair)
          .filter((point): point is RouteCatalogDiscoveryCoordinate => !!point),
      )
      .filter((line) => line.length >= 2);
  }
  return [];
}

export function distanceMilesFromPointToSegment(
  point: RouteCatalogDiscoveryCoordinate,
  start: RouteCatalogDiscoveryCoordinate,
  end: RouteCatalogDiscoveryCoordinate,
): number {
  const milesPerDegreeLatitude = 69.0;
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

export function routeCatalogGeometryDistanceMiles(
  record: Record<string, unknown>,
  center: RouteCatalogDiscoveryCoordinate,
): number | null {
  const lines = geometryLines(record);
  let nearest = Number.POSITIVE_INFINITY;
  lines.forEach((line) => {
    for (let index = 1; index < line.length; index += 1) {
      nearest = Math.min(nearest, distanceMilesFromPointToSegment(center, line[index - 1], line[index]));
    }
  });
  return Number.isFinite(nearest) ? nearest : null;
}

function tripTypeFromText(value: unknown): RouteCatalogDiscoveryTripType | null {
  const token = normalizeToken(value);
  if (!token) return null;
  if (['day', 'day_trip', 'daytrip', 'single_day', 'same_day'].includes(token)) return 'day_trip';
  if (['overnight', 'overnight_camp', 'overnight_camping'].includes(token)) return 'overnight_camping';
  if (['weekend', 'weekend_trip', 'weekend_overland', 'two_day', 'two_day_trip'].includes(token)) {
    return 'weekend_overland';
  }
  if (['expedition', 'multi_day', 'multi_day_expedition', 'extended'].includes(token)) {
    return 'multi_day_expedition';
  }
  return null;
}

function explicitTripType(record: Record<string, unknown>): RouteCatalogDiscoveryTripType | null {
  const direct = tripTypeFromText(
    record.trip_type ??
      record.tripType ??
      record.catalog_trip_type ??
      record.catalogTripType ??
      record.trip_intent ??
      record.tripIntent,
  );
  if (direct) return direct;
  const intelligence = readRecord(record.route_intelligence ?? record.routeIntelligence);
  if (!intelligence) return null;
  return tripTypeFromText(
    intelligence.trip_type ??
      intelligence.tripType ??
      intelligence.catalog_trip_type ??
      intelligence.catalogTripType ??
      intelligence.trip_intent ??
      intelligence.tripIntent,
  );
}

function routeRequiresCamping(record: Record<string, unknown>): boolean {
  const intelligence = readRecord(record.route_intelligence ?? record.routeIntelligence);
  const values = [
    record.requires_camping,
    record.requiresCamping,
    record.overnight_required,
    record.overnightRequired,
    intelligence?.requires_camping,
    intelligence?.requiresCamping,
    intelligence?.overnight_required,
    intelligence?.overnightRequired,
  ];
  if (values.some((value) => value === true)) return true;
  const text = routeSearchHaystack(record);
  return /\b(overnight|requires camping|camping required|multi day|multi-day)\b/.test(text);
}

function computedTripType(record: Record<string, unknown>): RouteCatalogDiscoveryTripType {
  const distanceMiles = readFirstNumber(record, ['distance_miles', 'distanceMiles', 'routeMiles']);
  const durationMinutes = readFirstNumber(record, [
    'estimated_duration_minutes',
    'estimatedDurationMinutes',
    'duration_minutes',
    'durationMinutes',
  ]);
  const durationHours = durationMinutes != null ? durationMinutes / 60 : null;
  const suggestedCamps = readFirstNumber(record, ['suggested_camps', 'suggestedCamps']);
  const text = routeSearchHaystack(record);

  if (/\b(expedition|multi day|multi-day|extended travel)\b/.test(text)) return 'multi_day_expedition';
  if (durationHours != null && durationHours > WEEKEND_TRIP_MAX_HOURS) return 'multi_day_expedition';
  if ((distanceMiles ?? 0) >= EXPEDITION_MIN_DISTANCE_MILES) return 'multi_day_expedition';
  if ((suggestedCamps ?? 0) >= 2) return 'multi_day_expedition';

  if (/\b(weekend|two day|2 day|overnight)\b/.test(text)) return 'weekend_overland';
  if (routeRequiresCamping(record)) return 'weekend_overland';
  if (durationHours != null && durationHours > DAY_TRIP_MAX_HOURS) return 'weekend_overland';
  if ((suggestedCamps ?? 0) > 0) return 'weekend_overland';

  return 'day_trip';
}

function estimatedDaysForTripType(
  tripType: RouteCatalogDiscoveryTripType,
  record: Record<string, unknown>,
): number {
  const explicitDays = readFirstNumber(record, ['estimated_days', 'estimatedDays', 'trip_days', 'tripDays']);
  if (explicitDays != null && explicitDays > 0) {
    if (tripType === 'day_trip') return 1;
    if (tripType === 'overnight_camping' || tripType === 'weekend_overland') return Math.max(2, Math.ceil(explicitDays));
    if (tripType === 'multi_day_expedition') return Math.max(3, Math.ceil(explicitDays));
  }
  const durationMinutes = readFirstNumber(record, ['estimated_duration_minutes', 'estimatedDurationMinutes']);
  const durationDays = durationMinutes != null ? Math.ceil(Math.max(1, durationMinutes / 480)) : 1;
  if (tripType === 'day_trip') return 1;
  if (tripType === 'overnight_camping' || tripType === 'weekend_overland') {
    return Math.max(2, Math.min(3, durationDays));
  }
  if (tripType === 'multi_day_expedition') return Math.max(3, durationDays);
  return Math.max(1, durationDays);
}

export function classifyRouteCatalogTripType(value: unknown): RouteCatalogTripClassification {
  const record = readRecord(value) ?? {};
  const catalogTripType = explicitTripType(record);
  const computed = computedTripType(record);
  const tripType = catalogTripType ?? computed ?? 'unknown';
  const source = catalogTripType ? 'catalog' : computed ? 'computed' : 'unknown';
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (catalogTripType) {
    reasons.push(`Catalog trip type is ${catalogTripType}.`);
    if (computed && computed !== catalogTripType) {
      warnings.push(`Catalog trip type differs from computed ${computed}; keeping catalog trip type.`);
    }
  } else if (computed) {
    reasons.push(`Computed trip type is ${computed}.`);
  } else {
    reasons.push('Trip type is not available from catalog metadata.');
  }

  return {
    tripType,
    estimatedDays: estimatedDaysForTripType(tripType, record),
    source,
    confidence: catalogTripType ? 'high' : computed ? 'medium' : 'low',
    reasons,
    warnings,
    computedTripType: computed,
  };
}

function routeHasRegionTag(record: Record<string, unknown>, regionTags: string[]): boolean {
  if (regionTags.length === 0) return false;
  const tokens = routeAliases(record).map(normalizeToken).filter(Boolean);
  return regionTags.some((tag) => tokens.includes(tag) || tokens.some((token) => token.includes(tag)));
}

function knownFeaturedRouteScore(record: Record<string, unknown>): number {
  const text = routeSearchHaystack(record);
  const intelligence = readRecord(record.route_intelligence ?? record.routeIntelligence);
  let score = 0;
  for (const route of KNOWN_FEATURED_ROUTES) {
    if (route.aliases.some((alias) => text.includes(alias))) {
      score = Math.max(score, route.score);
    }
  }
  if (record.featured === true || intelligence?.featured === true || routeTags(record).some((tag) => /featured|known|iconic/i.test(tag))) {
    score = Math.max(score, 40);
  }
  return score;
}

function routeMatchesKnownAlias(record: Record<string, unknown>, aliases: readonly string[]): boolean {
  const text = routeSearchHaystack(record);
  return aliases.some((alias) => text.includes(normalizeSearchText(alias)));
}

function routeMatchesSearchTerm(record: Record<string, unknown>, searchTerms: string[]): boolean {
  if (searchTerms.length === 0) return false;
  const text = routeSearchHaystack(record);
  return searchTerms.some((term) => {
    const normalized = normalizeSearchText(term);
    return normalized.length > 0 && text.includes(normalized);
  });
}

function discoveryRecord(
  record: Record<string, unknown>,
  query: Required<Pick<RouteCatalogDiscoveryQuery, 'regionTags' | 'searchTerms'>>,
  searchCenter: RouteCatalogDiscoveryCoordinate | null,
  radiusMiles: number | null,
): RouteCatalogDiscoveryRecord | null {
  const geometryDistance = searchCenter ? routeCatalogGeometryDistanceMiles(record, searchCenter) : null;
  const trailhead = routeCatalogRecordTrailhead(record);
  const trailheadDistance = searchCenter && trailhead ? distanceMilesBetween(searchCenter, trailhead) : null;
  const center = routeCatalogRecordCenter(record);
  const centerDistance = searchCenter && center ? distanceMilesBetween(searchCenter, center) : null;
  const distances = [geometryDistance, trailheadDistance, centerDistance]
    .filter((value): value is number => value != null && Number.isFinite(value));
  const searchDistance = distances.length > 0 ? Math.min(...distances) : null;
  const matchReasons: string[] = [];

  if (radiusMiles != null) {
    if (geometryDistance != null && geometryDistance <= radiusMiles) matchReasons.push('geometry_within_radius');
    if (trailheadDistance != null && trailheadDistance <= radiusMiles) matchReasons.push('trailhead_within_radius');
    if (centerDistance != null && centerDistance <= radiusMiles) matchReasons.push('centroid_within_radius');
  } else {
    matchReasons.push('radius_not_applied');
  }

  if (routeHasRegionTag(record, (query.regionTags ?? []).map(normalizeToken).filter(Boolean))) {
    matchReasons.push('region_tag_match');
  }
  const featuredScore = knownFeaturedRouteScore(record);
  const matchesKnown = KNOWN_FEATURED_ROUTES.some((route) => routeMatchesKnownAlias(record, route.aliases));
  if (matchesKnown) matchReasons.push('known_route_alias');
  if (routeMatchesSearchTerm(record, query.searchTerms ?? [])) matchReasons.push('search_term_match');

  if (radiusMiles != null && !matchReasons.some((reason) => reason.endsWith('_within_radius'))) {
    return null;
  }

  return {
    ...record,
    search_distance_miles: roundDistance(searchDistance),
    geometry_distance_miles: roundDistance(geometryDistance),
    trailhead_distance_miles: roundDistance(trailheadDistance),
    center_distance_miles: roundDistance(centerDistance),
    search_match_reasons: unique(matchReasons),
    featured_route_score: featuredScore,
    catalog_trip_classification: classifyRouteCatalogTripType(record),
  };
}

function confidenceScore(record: Record<string, unknown>): number {
  return finiteNumber(record.confidence_score ?? record.confidenceScore) ?? 0;
}

function updatedAtMs(record: Record<string, unknown>): number {
  const text = cleanText(record.updated_at ?? record.updatedAt);
  const time = text ? Date.parse(text) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function compareDiscoveryRecords(left: RouteCatalogDiscoveryRecord, right: RouteCatalogDiscoveryRecord): number {
  const featuredDelta = right.featured_route_score - left.featured_route_score;
  if (featuredDelta !== 0) return featuredDelta;
  const leftDistance = left.search_distance_miles ?? Number.MAX_SAFE_INTEGER;
  const rightDistance = right.search_distance_miles ?? Number.MAX_SAFE_INTEGER;
  const distanceDelta = leftDistance - rightDistance;
  if (distanceDelta !== 0) return distanceDelta;
  const confidenceDelta = confidenceScore(right) - confidenceScore(left);
  if (confidenceDelta !== 0) return confidenceDelta;
  const updatedDelta = updatedAtMs(right) - updatedAtMs(left);
  if (updatedDelta !== 0) return updatedDelta;
  return routeName(left).localeCompare(routeName(right));
}

function knownRouteDiagnostics(
  candidates: Record<string, unknown>[],
  matchedRecords: RouteCatalogDiscoveryRecord[],
  query: RouteCatalogDiscoveryQuery,
): RouteCatalogKnownRouteDiagnostic[] {
  const requested = new Set((query.expectedKnownRoutes ?? query.searchTerms ?? []).map(normalizeSearchText).filter(Boolean));
  if (requested.size === 0) return [];

  return KNOWN_FEATURED_ROUTES
    .filter((known) => known.aliases.some((alias) => requested.has(normalizeSearchText(alias))))
    .map((known) => {
      const inCatalog = candidates.some((record) => routeMatchesKnownAlias(record, known.aliases));
      const matched = matchedRecords.some((record) => routeMatchesKnownAlias(record, known.aliases));
      if (matched) {
        return {
          routeKey: known.key,
          status: 'matched' as const,
          message: `${known.label} matched the current Explore catalog query.`,
        };
      }
      if (inCatalog) {
        return {
          routeKey: known.key,
          status: 'present_outside_results' as const,
          message: `${known.label} exists in the candidate catalog but did not match the current radius or filters.`,
        };
      }
      return {
        routeKey: known.key,
        status: 'missing_from_catalog' as const,
        message: `${known.label} was expected but no matching route catalog record was present in the queried catalog candidates.`,
      };
    });
}

export function queryRouteCatalogDiscoveryRecords(
  records: unknown[],
  query: RouteCatalogDiscoveryQuery = {},
): RouteCatalogDiscoveryResult {
  const latitude = finiteNumber(query.latitude);
  const longitude = finiteNumber(query.longitude);
  const radiusMiles = finiteNumber(query.radiusMiles);
  const hasRadiusCriteria = latitude != null && longitude != null && radiusMiles != null;
  const searchCenter = hasRadiusCriteria ? { latitude, longitude } : null;
  const limit = normalizeLimit(query.limit);
  const candidates = records
    .map(readRecord)
    .filter((record): record is Record<string, unknown> => !!record);
  const discoveryQuery = {
    regionTags: query.regionTags ?? [],
    searchTerms: query.searchTerms ?? [],
  };
  const allMatchedRecords = candidates
    .map((record) => discoveryRecord(record, discoveryQuery, searchCenter, hasRadiusCriteria ? radiusMiles : null))
    .filter((record): record is RouteCatalogDiscoveryRecord => !!record)
    .sort(compareDiscoveryRecords);
  const limitedRecords = allMatchedRecords.slice(0, limit);

  return {
    records: limitedRecords,
    allMatchedRecords,
    radiusFilterApplied: hasRadiusCriteria,
    matchedCount: allMatchedRecords.length,
    geometryMatchedCount: allMatchedRecords.filter((record) => record.search_match_reasons.includes('geometry_within_radius')).length,
    trailheadMatchedCount: allMatchedRecords.filter((record) => record.search_match_reasons.includes('trailhead_within_radius')).length,
    centerMatchedCount: allMatchedRecords.filter((record) => record.search_match_reasons.includes('centroid_within_radius')).length,
    aliasMatchedCount: allMatchedRecords.filter((record) =>
      record.search_match_reasons.includes('known_route_alias') ||
      record.search_match_reasons.includes('search_term_match'),
    ).length,
    featuredMatchedCount: allMatchedRecords.filter((record) => record.featured_route_score > 0).length,
    knownRouteDiagnostics: knownRouteDiagnostics(candidates, allMatchedRecords, query),
  };
}

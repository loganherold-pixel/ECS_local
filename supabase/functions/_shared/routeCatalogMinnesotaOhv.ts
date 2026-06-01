export type MinnesotaOhvFeature = {
  type?: string;
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
};

export type MinnesotaOhvRouteContext = {
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
};

export const MINNESOTA_OHV_SOURCE = {
  providerId: 'minnesota_dnr_ohv_trails',
  name: 'Minnesota DNR OHV Trails',
  sourceUri: 'https://gisdata.mn.gov/dataset/trans-ohv-trails-mn',
  attribution: 'Minnesota Department of Natural Resources OHV Trails',
};

export const MINNESOTA_OHV_DOWNLOADS = {
  geopackage: 'https://resources.gisdata.mn.gov/pub/gdrs/data/pub/us_mn_state_dnr/trans_ohv_trails_mn/gpkg_trans_ohv_trails_mn.zip',
  shapefile: 'https://resources.gisdata.mn.gov/pub/gdrs/data/pub/us_mn_state_dnr/trans_ohv_trails_mn/shp_trans_ohv_trails_mn.zip',
};

const MINNESOTA_OHV_CAVEAT =
  'Minnesota DNR OHV Trails is official state source data for public OHV opportunities, but the dataset metadata says it is not to be used for navigation and is a reference layer only; current closures, permits, local rules, vehicle class fit, and seasonal conditions must be checked before ECS can publicly recommend a route.';

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function cleanNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

function toTitleCase(value: string): string {
  const acronyms = new Set(['dnr', 'ohv', 'orv', 'atv', 'utv', 'ohm', 'gia']);
  return value
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => acronyms.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stablePayloadHash(value: unknown): string {
  const json = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function isFlagged(value: unknown): boolean {
  return /^x|yes|true|1$/i.test(cleanString(value));
}

function normalizeLineString(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const longitude = Number(point[0]);
      const latitude = Number(point[1]);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      ) {
        return null;
      }
      return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
    })
    .filter((point): point is number[] => !!point);
}

function normalizeGeometrySegments(feature: MinnesotaOhvFeature): number[][][] {
  const type = cleanString(feature.geometry?.type).toLowerCase();
  const coordinates = feature.geometry?.coordinates;
  if (type === 'linestring') {
    const line = normalizeLineString(coordinates);
    return line.length >= 2 ? [line] : [];
  }
  if (type === 'multilinestring' && Array.isArray(coordinates)) {
    return coordinates.map(normalizeLineString).filter((line) => line.length >= 2);
  }
  return [];
}

function routeGeometryFromSegments(
  segments: number[][][],
  preferMultiLineString = false,
): { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] } | null {
  if (segments.length === 0) return null;
  if (segments.length === 1 && !preferMultiLineString) return { type: 'LineString', coordinates: segments[0] };
  return { type: 'MultiLineString', coordinates: segments };
}

function centerFromSegments(segments: number[][][]): { latitude: number; longitude: number } | null {
  const points = segments.flat();
  if (points.length === 0) return null;
  const totals = points.reduce(
    (acc, point) => ({
      longitude: acc.longitude + point[0],
      latitude: acc.latitude + point[1],
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: Number((totals.latitude / points.length).toFixed(6)),
    longitude: Number((totals.longitude / points.length).toFixed(6)),
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function orderedVehicleFit(values: string[]): string[] {
  const order = ['full_size_4x4', 'atv', 'utv', 'motorcycle'];
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}

function vehicleFitFromProperties(properties: Record<string, unknown>): string[] {
  const fit = new Set<string>();
  if (isFlagged(properties.OFF_ROAD_VEHICLE)) fit.add('full_size_4x4');
  if (isFlagged(properties.ATV_CLASS_1)) fit.add('atv');
  if (isFlagged(properties.ATV_CLASS_2)) fit.add('utv');
  if (isFlagged(properties.OFF_HIGHWAY_MOTORCYCLE)) fit.add('motorcycle');
  return orderedVehicleFit(Array.from(fit));
}

function coverageForProperties(properties: Record<string, unknown>): number {
  if (isFlagged(properties.OFF_ROAD_VEHICLE)) return 86;
  if (isFlagged(properties.OFF_HIGHWAY_MOTORCYCLE)) return 84;
  return 82;
}

function confidenceForProperties(properties: Record<string, unknown>): number {
  if (isFlagged(properties.OFF_ROAD_VEHICLE)) return 84;
  if (isFlagged(properties.OFF_HIGHWAY_MOTORCYCLE)) return 82;
  return 80;
}

function sourceFeatureKey(properties: Record<string, unknown>): string {
  return cleanString(properties.OBJECTID || properties.STABLE_PROD_GUID || properties.PROGRAM_PROJECT || '0') || '0';
}

function providerFeatureId(properties: Record<string, unknown>): string {
  return `minnesota-dnr-ohv:${sourceFeatureKey(properties)}`;
}

function routeName(properties: Record<string, unknown>): string {
  const trailName = toTitleCase(cleanString(properties.TRAIL_NAME || 'Unnamed OHV Trail'));
  const segmentName = toTitleCase(cleanString(properties.SEGMENT_NAME));
  return segmentName
    ? `Minnesota DNR OHV ${trailName} - ${segmentName}`
    : `Minnesota DNR OHV ${trailName}`;
}

function publicIdForFeature(properties: Record<string, unknown>): string {
  return slugify([
    'minnesota-dnr-ohv',
    cleanString(properties.TRAIL_NAME || properties.SEGMENT_NAME),
    `feature ${sourceFeatureKey(properties)}`,
  ].filter(Boolean).join(' '));
}

function estimateRemotenessScore(distanceMiles: number): number {
  return Number(clampNumber(4 + Math.min(2.5, distanceMiles / 18), 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.4));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  return Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
}

function routeIntelligence(args: {
  distanceMiles: number;
  estimatedDurationMinutes: number;
}) {
  return {
    sourceAdapter: 'minnesota_dnr_ohv_trails',
    sourceLayerName: 'Minnesota OHV Trails',
    remotenessBasis: 'estimated_from_minnesota_dnr_ohv_distance_and_state_trail_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_minnesota_dnr_ohv_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    distanceMiles: args.distanceMiles,
    estimatedDurationMinutes: args.estimatedDurationMinutes,
    caveat: MINNESOTA_OHV_CAVEAT,
  };
}

export function minnesotaOhvSourceUpsert(lastCheckedAt = new Date().toISOString()) {
  return {
    provider_id: MINNESOTA_OHV_SOURCE.providerId,
    name: MINNESOTA_OHV_SOURCE.name,
    source_type: 'state_agency',
    authority: 'official_access',
    source_uri: MINNESOTA_OHV_SOURCE.sourceUri,
    attribution: MINNESOTA_OHV_SOURCE.attribution,
    license: 'Open to public use, no restrictions; Minnesota DNR data license applies',
    refresh_frequency: 'annual season dataset',
    status: 'active',
    last_checked_at: lastCheckedAt,
  };
}

export function normalizeMinnesotaOhvFeatureCollection(payload: unknown): MinnesotaOhvFeature[] {
  const record = payload && typeof payload === 'object' ? payload as { features?: unknown } : {};
  if (!Array.isArray(record.features)) return [];
  return record.features
    .filter((feature): feature is Record<string, unknown> => !!feature && typeof feature === 'object')
    .map((feature) => ({
      type: cleanString(feature.type || 'Feature'),
      properties: feature.properties && typeof feature.properties === 'object'
        ? feature.properties as Record<string, unknown>
        : {},
      geometry: feature.geometry && typeof feature.geometry === 'object'
        ? feature.geometry as MinnesotaOhvFeature['geometry']
        : undefined,
    }));
}

export function featureToMinnesotaOhvRouteUpsert(
  feature: MinnesotaOhvFeature,
  context: MinnesotaOhvRouteContext,
) {
  const properties = feature.properties ?? {};
  const distanceMiles = cleanNumber(properties.MILES);
  const minMiles = Math.max(0, Number(context.minMiles ?? 1));
  if (distanceMiles == null || distanceMiles < minMiles) return null;

  const vehicleFit = vehicleFitFromProperties(properties);
  if (vehicleFit.length === 0) return null;

  const segments = normalizeGeometrySegments(feature);
  const routeGeometry = routeGeometryFromSegments(segments, /^multilinestring$/i.test(cleanString(feature.geometry?.type)));
  const center = centerFromSegments(segments);
  if (!routeGeometry || !center) return null;

  const publicId = publicIdForFeature(properties);
  const providerId = providerFeatureId(properties);
  const coverage = coverageForProperties(properties);
  const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 15));

  const verifiedRoute = {
    public_id: publicId,
    name: routeName(properties),
    description: 'Minnesota DNR official OHV trail geometry. ECS stores this as state source-backed curation input, not as a finished expedition route recommendation.',
    route_type: 'point_to_point',
    center_latitude: center.latitude,
    center_longitude: center.longitude,
    route_geometry: routeGeometry,
    distance_miles: Number(distanceMiles.toFixed(3)),
    estimated_duration_minutes: estimatedDurationMinutes,
    difficulty: 'unknown',
    vehicle_fit: vehicleFit,
    remoteness_score: estimateRemotenessScore(distanceMiles),
    campability_score: null,
    minimum_fuel_range_miles: estimateMinimumFuelRangeMiles(distanceMiles),
    minimum_water_capacity_gallons: estimateMinimumWaterCapacityGallons(estimatedDurationMinutes),
    route_intelligence: routeIntelligence({ distanceMiles, estimatedDurationMinutes }),
    official_access_coverage_pct: coverage,
    unknown_access_coverage_pct: 100 - coverage,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'partially_verified',
    recommendation_status: 'not_recommended',
    review_status: 'approved',
    confidence_score: confidenceForProperties(properties),
    confidence_reasons: [
      'Minnesota DNR publishes this as official public OHV trail source data.',
      `Allowed use fields: ${vehicleFit.join(', ')}.`,
    ],
    warning_reasons: [
      MINNESOTA_OHV_CAVEAT,
      'Minnesota DNR OHV source awaits ECS route curation before public recommendation.',
    ],
    blocker_reasons: ['Minnesota DNR OHV geometry is not yet reviewed with current Minnesota DNR closures, local rules, seasonal conditions, and ECS route curation.'],
    closure_summaries: [],
    community_signal: {
      sourceAdapter: 'minnesota_dnr_ohv_trails',
      providerFeatureId: providerId,
      trailName: cleanString(properties.TRAIL_NAME) || null,
      segmentName: cleanString(properties.SEGMENT_NAME) || null,
      programProject: cleanString(properties.PROGRAM_PROJECT) || null,
      stableProdGuid: cleanString(properties.STABLE_PROD_GUID) || null,
      website: cleanString(properties.WEB_SITE) || null,
      surfaceType: cleanString(properties.SURFACE_TYPE) || null,
      fundingType: cleanString(properties.FUNDING_TYPE) || null,
      trailWidth: cleanString(properties.TRAIL_WIDTH) || null,
      roadClass: cleanString(properties.ROAD_CLASS) || null,
    },
    tags: uniqueStrings([
      'Minnesota DNR OHV',
      'state agency',
      cleanString(properties.FUNDING_TYPE),
      cleanString(properties.SURFACE_TYPE),
      cleanString(properties.TRAIL_WIDTH),
      cleanString(properties.ROAD_CLASS),
    ]),
    last_verified_at: context.sourceLastVerifiedAt,
    stale_at: addDaysIso(context.sourceLastVerifiedAt, 150),
  };

  const rawSourceFeature = {
    route_source_id: context.sourceId,
    ingest_run_id: context.ingestRunId ?? null,
    provider_feature_id: providerId,
    source_layer: 'Minnesota OHV Trails: ohv_trails_mn',
    source_uri: MINNESOTA_OHV_DOWNLOADS.geopackage,
    payload_hash: stablePayloadHash(feature),
    geometry: null,
    properties: {
      attributes: properties,
      geometry: routeGeometry,
      routeCatalogPublicId: publicId,
    },
    last_seen_at: context.sourceLastVerifiedAt,
  };

  const verifiedRouteSource = {
    route_source_id: context.sourceId,
    source_role: 'primary',
    coverage_pct: coverage,
    last_verified_at: context.sourceLastVerifiedAt,
    metadata: {
      providerFeatureId: providerId,
      sourceLayer: 'Minnesota OHV Trails: ohv_trails_mn',
      officialDownloadUrl: MINNESOTA_OHV_DOWNLOADS.geopackage,
      trailName: cleanString(properties.TRAIL_NAME) || null,
      segmentName: cleanString(properties.SEGMENT_NAME) || null,
      programProject: cleanString(properties.PROGRAM_PROJECT) || null,
      caveat: MINNESOTA_OHV_CAVEAT,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}

export type ColoradoCpwDesignatedTrailFeature = {
  type?: string;
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
};

export type ColoradoCpwDesignatedTrailRouteContext = {
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
};

export const COLORADO_CPW_DESIGNATED_TRAILS_SOURCE = {
  providerId: 'colorado_cpw_designated_trails',
  name: 'Colorado CPW Designated Trails',
  sourceUri: 'https://services1.arcgis.com/82YxYqy3f0s2D9c4/ArcGIS/rest/services/CPWDesignatedTrails02172021/FeatureServer/0',
  attribution: 'Colorado Parks & Wildlife, Colorado State Trails Program designated trails inventory',
};

export const COLORADO_CPW_DESIGNATED_TRAILS_QUERY = {
  where: [
    "motorcycle = 'Yes'",
    "motorcycle = 'yes'",
    "atv = 'Yes'",
    "atv = 'yes'",
    "ohv_gt_50 = 'Yes'",
    "ohv_gt_50 = 'yes'",
    "highway_ve = 'Yes'",
    "highway_ve = 'yes'",
  ].join(' OR '),
  outFields: '*',
  outSR: 4326,
};

const COLORADO_CPW_DESIGNATED_TRAILS_CAVEAT =
  'Colorado CPW Designated Trails is official state source data for permitted recreation uses on CPW properties, but current closures, permits, trail signage, property rules, weather, fire restrictions, and seasonal conditions still require trip-date checks before travel.';

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
  const acronyms = new Set(['cpw', 'ohv', 'atv', 'utv', 'sp']);
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

function isAllowed(value: unknown): boolean {
  return /^(yes|y|true|1)$/i.test(cleanString(value));
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

function normalizeGeometrySegments(feature: ColoradoCpwDesignatedTrailFeature): number[][][] {
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

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMiles(a: number[], b: number[]): number {
  const earthRadiusMiles = 3958.7613;
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const deltaLat = toRadians(b[1] - a[1]);
  const deltaLon = toRadians(b[0] - a[0]);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function distanceMilesFromSegments(segments: number[][][]): number {
  return segments.reduce((total, segment) => {
    let segmentTotal = 0;
    for (let index = 1; index < segment.length; index += 1) {
      segmentTotal += haversineMiles(segment[index - 1], segment[index]);
    }
    return total + segmentTotal;
  }, 0);
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
  if (isAllowed(properties.highway_ve) || isAllowed(properties.ohv_gt_50)) fit.add('full_size_4x4');
  if (isAllowed(properties.atv)) {
    fit.add('atv');
    fit.add('utv');
  }
  if (isAllowed(properties.ohv_gt_50)) fit.add('utv');
  if (isAllowed(properties.motorcycle)) fit.add('motorcycle');
  return orderedVehicleFit(Array.from(fit));
}

function coverageForVehicleFit(vehicleFit: string[]): number {
  if (vehicleFit.includes('full_size_4x4')) return 84;
  if (vehicleFit.includes('atv') || vehicleFit.includes('utv')) return 82;
  return 80;
}

function confidenceForVehicleFit(vehicleFit: string[]): number {
  if (vehicleFit.includes('full_size_4x4')) return 83;
  if (vehicleFit.includes('atv') || vehicleFit.includes('utv')) return 81;
  return 80;
}

function sourceFeatureKey(feature: ColoradoCpwDesignatedTrailFeature, properties: Record<string, unknown>): string {
  return cleanString(properties.FID || properties.OBJECTID || properties.TrailGUID || feature.id || '0') || '0';
}

function providerFeatureId(feature: ColoradoCpwDesignatedTrailFeature, properties: Record<string, unknown>): string {
  return `colorado-cpw-designated-trails:${sourceFeatureKey(feature, properties)}`;
}

function publicIdForFeature(feature: ColoradoCpwDesignatedTrailFeature, properties: Record<string, unknown>): string {
  return slugify([
    'colorado-cpw-designated-trail',
    cleanString(properties.name || 'unnamed trail'),
    `feature ${sourceFeatureKey(feature, properties)}`,
  ].join(' '));
}

function routeName(properties: Record<string, unknown>): string {
  const trailName = toTitleCase(cleanString(properties.name || 'Unnamed Trail'));
  const propertyName = toTitleCase(cleanString(properties.PropName || properties.manager));
  return propertyName
    ? `Colorado CPW Designated Trail ${trailName} - ${propertyName}`
    : `Colorado CPW Designated Trail ${trailName}`;
}

function estimateRemotenessScore(distanceMiles: number): number {
  return Number(clampNumber(3.5 + Math.min(2.5, distanceMiles / 18), 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.35));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  return Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
}

function permittedUses(properties: Record<string, unknown>): string[] {
  return uniqueStrings([
    isAllowed(properties.highway_ve) ? 'highway_vehicle' : '',
    isAllowed(properties.ohv_gt_50) ? 'ohv_gt_50' : '',
    isAllowed(properties.atv) ? 'atv' : '',
    isAllowed(properties.motorcycle) ? 'motorcycle' : '',
    isAllowed(properties.Snowmobile) ? 'snowmobile' : '',
  ]);
}

function routeIntelligence(args: {
  distanceMiles: number;
  estimatedDurationMinutes: number;
  properties: Record<string, unknown>;
  vehicleFit: string[];
}) {
  return {
    sourceAdapter: 'colorado_cpw_designated_trails',
    sourceLayerName: 'Colorado CPW Designated Trails',
    permittedUses: permittedUses(args.properties),
    vehicleFit: args.vehicleFit,
    remotenessBasis: 'estimated_from_colorado_cpw_designated_trail_distance_and_state_park_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_colorado_cpw_designated_trail_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    distanceMiles: args.distanceMiles,
    estimatedDurationMinutes: args.estimatedDurationMinutes,
    sourceEditDate: cleanString(args.properties.EDIT_DATE) || null,
    caveat: COLORADO_CPW_DESIGNATED_TRAILS_CAVEAT,
  };
}

export function coloradoCpwDesignatedTrailsSourceUpsert(lastCheckedAt = new Date().toISOString()) {
  return {
    provider_id: COLORADO_CPW_DESIGNATED_TRAILS_SOURCE.providerId,
    name: COLORADO_CPW_DESIGNATED_TRAILS_SOURCE.name,
    source_type: 'state_agency',
    authority: 'official_access',
    source_uri: COLORADO_CPW_DESIGNATED_TRAILS_SOURCE.sourceUri,
    attribution: COLORADO_CPW_DESIGNATED_TRAILS_SOURCE.attribution,
    license: 'state agency published ArcGIS FeatureServer layer',
    refresh_frequency: 'agency maintained FeatureServer',
    status: 'active',
    last_checked_at: lastCheckedAt,
  };
}

export function normalizeColoradoCpwDesignatedTrailFeatureCollection(payload: unknown): ColoradoCpwDesignatedTrailFeature[] {
  const record = payload && typeof payload === 'object' ? payload as { features?: unknown } : {};
  if (!Array.isArray(record.features)) return [];
  return record.features
    .filter((feature): feature is Record<string, unknown> => !!feature && typeof feature === 'object')
    .map((feature) => ({
      type: cleanString(feature.type || 'Feature'),
      id: typeof feature.id === 'string' || typeof feature.id === 'number' ? feature.id : undefined,
      properties: feature.properties && typeof feature.properties === 'object'
        ? feature.properties as Record<string, unknown>
        : {},
      geometry: feature.geometry && typeof feature.geometry === 'object'
        ? feature.geometry as ColoradoCpwDesignatedTrailFeature['geometry']
        : undefined,
    }));
}

export function featureToColoradoCpwDesignatedTrailRouteUpsert(
  feature: ColoradoCpwDesignatedTrailFeature,
  context: ColoradoCpwDesignatedTrailRouteContext,
) {
  const properties = feature.properties ?? {};
  const vehicleFit = vehicleFitFromProperties(properties);
  if (vehicleFit.length === 0) return null;

  const segments = normalizeGeometrySegments(feature);
  const routeGeometry = routeGeometryFromSegments(segments, /^multilinestring$/i.test(cleanString(feature.geometry?.type)));
  const center = centerFromSegments(segments);
  if (!routeGeometry || !center) return null;

  const calculatedDistanceMiles = distanceMilesFromSegments(segments);
  const publishedDistanceMiles = cleanNumber(properties.length_mi_);
  const distanceMiles = publishedDistanceMiles && publishedDistanceMiles > 0
    ? publishedDistanceMiles
    : calculatedDistanceMiles;
  const minMiles = Math.max(0, Number(context.minMiles ?? 0.25));
  if (distanceMiles < minMiles) return null;

  const publicId = publicIdForFeature(feature, properties);
  const providerId = providerFeatureId(feature, properties);
  const coverage = coverageForVehicleFit(vehicleFit);
  const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 15));
  const routeSourceLayer = 'Colorado CPW Designated Trails: CPWDesignatedTrails02172021';
  const warnings = [
    COLORADO_CPW_DESIGNATED_TRAILS_CAVEAT,
    'Check current Colorado CPW closures, permits, trail signage, property rules, fire restrictions, weather, and seasonal conditions before travel.',
  ];

  const verifiedRoute = {
    public_id: publicId,
    name: routeName(properties),
    description: 'Colorado Parks & Wildlife official designated trail geometry with permitted-use fields. ECS publishes motorized-permitted records as official source-backed route recommendations with visible current-condition caveats.',
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
    route_intelligence: routeIntelligence({ distanceMiles, estimatedDurationMinutes, properties, vehicleFit }),
    official_access_coverage_pct: coverage,
    unknown_access_coverage_pct: 100 - coverage,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'official_verified',
    recommendation_status: 'recommendable',
    review_status: 'approved',
    confidence_score: confidenceForVehicleFit(vehicleFit),
    confidence_reasons: [
      'Colorado CPW publishes this designated-trails layer with permitted recreation-use fields.',
      `Motorized permitted-use fields: ${permittedUses(properties).join(', ')}.`,
    ],
    warning_reasons: warnings,
    blocker_reasons: [],
    closure_summaries: [],
    community_signal: {
      sourceAdapter: 'colorado_cpw_designated_trails',
      providerFeatureId: providerId,
      featureId: sourceFeatureKey(feature, properties),
      propertyName: cleanString(properties.PropName) || null,
      manager: cleanString(properties.manager) || null,
      propertyType: cleanString(properties.PropType) || null,
      surface: cleanString(properties.surface) || null,
      permittedUses: permittedUses(properties),
      calculatedDistanceMiles: Number(calculatedDistanceMiles.toFixed(3)),
      publishedDistanceMiles,
      editDate: cleanString(properties.EDIT_DATE) || null,
    },
    tags: uniqueStrings([
      'Colorado CPW Designated Trails',
      'state agency',
      cleanString(properties.PropName),
      cleanString(properties.manager),
      cleanString(properties.surface),
      ...vehicleFit,
    ]),
    last_verified_at: context.sourceLastVerifiedAt,
    stale_at: addDaysIso(context.sourceLastVerifiedAt, 150),
  };

  const rawSourceFeature = {
    route_source_id: context.sourceId,
    ingest_run_id: context.ingestRunId ?? null,
    provider_feature_id: providerId,
    source_layer: routeSourceLayer,
    source_uri: COLORADO_CPW_DESIGNATED_TRAILS_SOURCE.sourceUri,
    payload_hash: stablePayloadHash(feature),
    geometry: null,
    properties: {
      attributes: properties,
      geometry: routeGeometry,
      routeCatalogPublicId: publicId,
      calculatedDistanceMiles: Number(calculatedDistanceMiles.toFixed(3)),
      publishedDistanceMiles,
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
      sourceLayer: routeSourceLayer,
      officialFeatureServerUrl: COLORADO_CPW_DESIGNATED_TRAILS_SOURCE.sourceUri,
      propertyName: cleanString(properties.PropName) || null,
      manager: cleanString(properties.manager) || null,
      permittedUses: permittedUses(properties),
      caveat: COLORADO_CPW_DESIGNATED_TRAILS_CAVEAT,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}

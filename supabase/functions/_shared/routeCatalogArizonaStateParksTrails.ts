export type ArizonaStateParksTrailFeature = {
  attributes?: Record<string, unknown>;
  geometry?: {
    paths?: unknown;
  };
};

export type ArizonaStateParksTrailRouteContext = {
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
};

export const ARIZONA_STATE_PARKS_TRAILS_SOURCE = {
  providerId: 'arizona_state_parks_trails',
  name: 'Arizona State Parks and Trails Statewide Trails',
  sourceUri: 'https://services1.arcgis.com/UpxtrwRYNaXVpkGe/ArcGIS/rest/services/AZSPTrails/FeatureServer/3',
  attribution: 'Arizona State Parks and Trails, Statewide Trails dataset',
};

export const ARIZONA_STATE_PARKS_TRAILS_QUERY = {
  where: [
    "(Motorized = 'Y' OR Motorcycle = 'Y' OR ATV = 'Y' OR UTV = 'Y')",
    "Status IN ('Verified','Open','Road')",
  ].join(' AND '),
  outFields: [
    'FID',
    'TrailName',
    'TrailID',
    'Status',
    'Miles',
    'Jurisdicti',
    'Manager',
    'ManagUnit',
    'County',
    'System',
    'Surface',
    'Type',
    'Motorized',
    'Motorcycle',
    'ATV',
    'UTV',
    'StreetVehi',
    'Snowmobile',
    'Seasonal',
    'Permit_Gui',
    'PrimeUse',
    'Source',
    'Website',
    'Verified',
    'Shape__Length',
  ].join(','),
  outSR: 4326,
};

const ARIZONA_STATE_PARKS_TRAILS_CAVEAT =
  'Arizona State Parks and Trails publishes this statewide trails dataset with motorized-use fields, but it is not a current local closure, signage, permit, land-ownership, weather, fire restriction, or vehicle-class authority. Confirm current local access before travel.';

const METERS_PER_MILE = 1609.344;

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
  const acronyms = new Set(['aspt', 'az', 'ohv', 'atv', 'utv', 'blm', 'usfs']);
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

function isYes(value: unknown): boolean {
  return /^(y|yes|true|1)$/i.test(cleanString(value));
}

function isPublicStatus(value: unknown): boolean {
  return /^(verified|open|road)$/i.test(cleanString(value));
}

function normalizePoint(point: unknown): number[] | null {
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
}

function normalizeLineString(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizePoint)
    .filter((point): point is number[] => !!point);
}

function normalizeGeometrySegments(feature: ArizonaStateParksTrailFeature): number[][][] {
  const paths = feature.geometry?.paths;
  if (!Array.isArray(paths)) return [];
  return paths
    .map(normalizeLineString)
    .filter((line) => line.length >= 2);
}

function routeGeometryFromSegments(
  segments: number[][][],
): { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] } | null {
  if (segments.length === 0) return null;
  if (segments.length === 1) return { type: 'LineString', coordinates: segments[0] };
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
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sourceFeatureKey(feature: ArizonaStateParksTrailFeature): string {
  const attributes = feature.attributes ?? {};
  return cleanString(attributes.FID || attributes.OBJECTID || attributes.GlobalID || attributes.TrailID || '0') || '0';
}

function providerFeatureId(feature: ArizonaStateParksTrailFeature): string {
  return `arizona-state-parks-trails:${sourceFeatureKey(feature)}`;
}

function routeBaseName(attributes: Record<string, unknown>): string {
  return cleanString(attributes.TrailName) ||
    cleanString(attributes.TrailID) ||
    cleanString(attributes.System) ||
    'Unnamed Arizona Trail';
}

function publicIdForFeature(feature: ArizonaStateParksTrailFeature): string {
  return slugify([
    'arizona-state-parks-trail',
    routeBaseName(feature.attributes ?? {}),
    `feature ${sourceFeatureKey(feature)}`,
  ].join(' '));
}

function routeName(attributes: Record<string, unknown>): string {
  const name = toTitleCase(routeBaseName(attributes));
  const county = toTitleCase(cleanString(attributes.County));
  return county ? `Arizona State Parks Trail ${name} - ${county} County` : `Arizona State Parks Trail ${name}`;
}

function estimateRemotenessScore(distanceMiles: number, attributes: Record<string, unknown>): number {
  const manager = [
    cleanString(attributes.Manager),
    cleanString(attributes.Jurisdicti),
    cleanString(attributes.ManagUnit),
  ].join(' ').toLowerCase();
  const remoteManagerBonus = /forest|blm|state|tribal|federal|wildlife|national/i.test(manager) ? 0.9 : 0.35;
  return Number(clampNumber(3.4 + remoteManagerBonus + Math.min(2.1, distanceMiles / 24), 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.45));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  return Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
}

function publishedDistanceMiles(attributes: Record<string, unknown>): number | null {
  const publishedMiles = cleanNumber(attributes.Miles);
  if (publishedMiles && publishedMiles > 0) return publishedMiles;
  const shapeMeters = cleanNumber(attributes.Shape__Length);
  if (shapeMeters && shapeMeters > 0) return shapeMeters / METERS_PER_MILE;
  return null;
}

function vehicleFitForAttributes(attributes: Record<string, unknown>): string[] {
  const fit = new Set<string>();
  if (isYes(attributes.Motorized)) {
    fit.add('full_size_4x4');
    fit.add('atv');
    fit.add('utv');
    fit.add('motorcycle');
  }
  if (isYes(attributes.StreetVehi)) fit.add('full_size_4x4');
  if (isYes(attributes.ATV)) fit.add('atv');
  if (isYes(attributes.UTV)) fit.add('utv');
  if (isYes(attributes.Motorcycle)) fit.add('motorcycle');
  return Array.from(fit);
}

function routeIntelligence(args: {
  attributes: Record<string, unknown>;
  distanceMiles: number;
  estimatedDurationMinutes: number;
  calculatedDistanceMiles: number;
  vehicleFit: string[];
}) {
  return {
    sourceAdapter: 'arizona_state_parks_trails',
    sourceLayerName: 'Arizona State Parks and Trails Statewide Trails',
    status: cleanString(args.attributes.Status),
    verified: cleanString(args.attributes.Verified),
    motorized: cleanString(args.attributes.Motorized),
    motorcycle: cleanString(args.attributes.Motorcycle),
    atv: cleanString(args.attributes.ATV),
    utv: cleanString(args.attributes.UTV),
    streetVehicle: cleanString(args.attributes.StreetVehi),
    snowmobile: cleanString(args.attributes.Snowmobile),
    seasonal: cleanString(args.attributes.Seasonal),
    permitGuide: cleanString(args.attributes.Permit_Gui),
    surface: cleanString(args.attributes.Surface),
    trailType: cleanString(args.attributes.Type),
    primeUse: cleanString(args.attributes.PrimeUse),
    jurisdiction: cleanString(args.attributes.Jurisdicti),
    manager: cleanString(args.attributes.Manager),
    managementUnit: cleanString(args.attributes.ManagUnit),
    county: cleanString(args.attributes.County),
    source: cleanString(args.attributes.Source),
    website: cleanString(args.attributes.Website),
    vehicleFit: args.vehicleFit,
    remotenessBasis: 'estimated_from_arizona_state_parks_distance_manager_and_statewide_trail_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_arizona_state_parks_trail_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    distanceMiles: args.distanceMiles,
    calculatedDistanceMiles: Number(args.calculatedDistanceMiles.toFixed(3)),
    estimatedDurationMinutes: args.estimatedDurationMinutes,
    caveat: ARIZONA_STATE_PARKS_TRAILS_CAVEAT,
  };
}

export function arizonaStateParksTrailsSourceUpsert(lastCheckedAt = new Date().toISOString()) {
  return {
    provider_id: ARIZONA_STATE_PARKS_TRAILS_SOURCE.providerId,
    name: ARIZONA_STATE_PARKS_TRAILS_SOURCE.name,
    source_type: 'state_agency',
    authority: 'official_access',
    source_uri: ARIZONA_STATE_PARKS_TRAILS_SOURCE.sourceUri,
    attribution: ARIZONA_STATE_PARKS_TRAILS_SOURCE.attribution,
    license: 'state agency published ArcGIS FeatureServer layer',
    refresh_frequency: 'agency maintained FeatureServer',
    status: 'active',
    last_checked_at: lastCheckedAt,
  };
}

export function normalizeArizonaStateParksTrailFeatureCollection(payload: unknown): ArizonaStateParksTrailFeature[] {
  const record = payload && typeof payload === 'object' ? payload as { features?: unknown } : {};
  if (!Array.isArray(record.features)) return [];
  return record.features
    .filter((feature): feature is Record<string, unknown> => !!feature && typeof feature === 'object')
    .map((feature) => ({
      attributes: feature.attributes && typeof feature.attributes === 'object'
        ? feature.attributes as Record<string, unknown>
        : {},
      geometry: feature.geometry && typeof feature.geometry === 'object'
        ? feature.geometry as ArizonaStateParksTrailFeature['geometry']
        : undefined,
    }));
}

export function featureToArizonaStateParksTrailRouteUpsert(
  feature: ArizonaStateParksTrailFeature,
  context: ArizonaStateParksTrailRouteContext,
) {
  const attributes = feature.attributes ?? {};
  if (!isPublicStatus(attributes.Status)) return null;

  const vehicleFit = vehicleFitForAttributes(attributes);
  if (vehicleFit.length === 0) return null;

  const segments = normalizeGeometrySegments(feature);
  const routeGeometry = routeGeometryFromSegments(segments);
  const center = centerFromSegments(segments);
  if (!routeGeometry || !center) return null;

  const calculatedDistanceMiles = distanceMilesFromSegments(segments);
  const publishedMiles = publishedDistanceMiles(attributes);
  const distanceMiles = publishedMiles && publishedMiles > 0
    ? publishedMiles
    : calculatedDistanceMiles;
  const minMiles = Math.max(0, Number(context.minMiles ?? 0.25));
  if (distanceMiles < minMiles) return null;

  const publicId = publicIdForFeature(feature);
  const providerId = providerFeatureId(feature);
  const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 16));
  const coverage = 74;
  const routeSourceLayer = 'Arizona State Parks and Trails: Statewide_Trais';
  const warnings = [
    ARIZONA_STATE_PARKS_TRAILS_CAVEAT,
    'Check current closures, permits, trail signage, land ownership, fire restrictions, weather, and local travel-management orders before travel.',
    'Arizona State Parks and Trails is a statewide trails dataset; ECS does not treat it as a current local closure authority or a guarantee that every motorized class is suitable.',
  ];

  const verifiedRoute = {
    public_id: publicId,
    name: routeName(attributes),
    description: 'Arizona State Parks and Trails official statewide trails geometry with motorized-use fields. ECS publishes open, verified, or road-status motorized records as official source-backed route recommendations with visible local-access caveats.',
    route_type: 'point_to_point',
    center_latitude: center.latitude,
    center_longitude: center.longitude,
    route_geometry: routeGeometry,
    distance_miles: Number(distanceMiles.toFixed(3)),
    estimated_duration_minutes: estimatedDurationMinutes,
    difficulty: 'unknown',
    vehicle_fit: vehicleFit,
    remoteness_score: estimateRemotenessScore(distanceMiles, attributes),
    campability_score: null,
    minimum_fuel_range_miles: estimateMinimumFuelRangeMiles(distanceMiles),
    minimum_water_capacity_gallons: estimateMinimumWaterCapacityGallons(estimatedDurationMinutes),
    route_intelligence: routeIntelligence({
      attributes,
      distanceMiles,
      estimatedDurationMinutes,
      calculatedDistanceMiles,
      vehicleFit,
    }),
    official_access_coverage_pct: coverage,
    unknown_access_coverage_pct: 100 - coverage,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: isYes(attributes.Seasonal) ? 1 : 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'official_verified',
    recommendation_status: 'recommendable',
    review_status: 'approved',
    confidence_score: 78,
    confidence_reasons: [
      'Arizona State Parks and Trails publishes this statewide trails layer with motorized-use fields.',
      'Only records with motorized use and status Open, Verified, or Road are promoted from the official source.',
    ],
    warning_reasons: warnings,
    blocker_reasons: [],
    closure_summaries: [],
    community_signal: {
      sourceAdapter: 'arizona_state_parks_trails',
      providerFeatureId: providerId,
      featureId: sourceFeatureKey(feature),
      trailName: cleanString(attributes.TrailName) || null,
      county: cleanString(attributes.County) || null,
      jurisdiction: cleanString(attributes.Jurisdicti) || null,
      manager: cleanString(attributes.Manager) || null,
      surface: cleanString(attributes.Surface) || null,
      status: cleanString(attributes.Status) || null,
      motorized: cleanString(attributes.Motorized) || null,
      motorcycle: cleanString(attributes.Motorcycle) || null,
      atv: cleanString(attributes.ATV) || null,
      utv: cleanString(attributes.UTV) || null,
      calculatedDistanceMiles: Number(calculatedDistanceMiles.toFixed(3)),
      publishedDistanceMiles: publishedMiles,
      source: cleanString(attributes.Source) || null,
      website: cleanString(attributes.Website) || null,
    },
    tags: uniqueStrings([
      'Arizona State Parks and Trails',
      'state agency',
      cleanString(attributes.County),
      cleanString(attributes.Jurisdicti),
      cleanString(attributes.Manager),
      cleanString(attributes.Surface),
      cleanString(attributes.Status),
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
    source_uri: ARIZONA_STATE_PARKS_TRAILS_SOURCE.sourceUri,
    payload_hash: stablePayloadHash(feature),
    geometry: null,
    properties: {
      attributes,
      geometry: routeGeometry,
      routeCatalogPublicId: publicId,
      calculatedDistanceMiles: Number(calculatedDistanceMiles.toFixed(3)),
      publishedDistanceMiles: publishedMiles,
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
      officialFeatureServerUrl: ARIZONA_STATE_PARKS_TRAILS_SOURCE.sourceUri,
      county: cleanString(attributes.County) || null,
      jurisdiction: cleanString(attributes.Jurisdicti) || null,
      manager: cleanString(attributes.Manager) || null,
      status: cleanString(attributes.Status) || null,
      motorized: cleanString(attributes.Motorized) || null,
      caveat: ARIZONA_STATE_PARKS_TRAILS_CAVEAT,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}

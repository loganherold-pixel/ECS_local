export type UtahTrailFeature = {
  attributes?: Record<string, unknown>;
  geometry?: {
    paths?: unknown;
  };
};

export type UtahTrailRouteContext = {
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
};

export const UTAH_TRAILS_SOURCE = {
  providerId: 'utah_sgid_trails',
  name: 'Utah SGID Trails and Pathways',
  sourceUri: 'https://services.arcgis.com/FvF9MZKp3JWPrSkg/ArcGIS/rest/services/Trails_and_Pathways_in_Utah/FeatureServer/0',
  attribution: 'Utah AGRC, Utah SGID Trails and Pathways in Utah',
};

export const UTAH_TRAILS_QUERY = {
  where: [
    "Status = 'EXISTING'",
    "MotorizedA = 'Yes'",
  ].join(' AND '),
  outFields: [
    'FID',
    'PrimaryNam',
    'ID',
    'Status',
    'Designated',
    'SurfaceTyp',
    'Class',
    'CartoCode',
    'OtherRestr',
    'HorseAllow',
    'MotorizedA',
    'OwnerStewa',
    'County',
    'Recreation',
    'SystemName',
    'TransNetwo',
    'Comments',
    'DataSource',
    'Unique_ID',
    'last_edi_1',
    'Shape__Length',
  ].join(','),
  outSR: 4326,
};

const UTAH_TRAILS_CAVEAT =
  'Utah SGID Trails and Pathways is an official statewide trail inventory with motorized-allowed attributes, but it is not a local closure, signage, permit, land-ownership, weather, fire restriction, or vehicle-class authority. Confirm current local access before travel.';

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
  const acronyms = new Set(['agrc', 'sgid', 'ohv', 'atv', 'utv', 'blm']);
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
  return /^yes$/i.test(cleanString(value));
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

function normalizeGeometrySegments(feature: UtahTrailFeature): number[][][] {
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

function sourceFeatureKey(feature: UtahTrailFeature): string {
  const attributes = feature.attributes ?? {};
  return cleanString(attributes.FID || attributes.Unique_ID || attributes.ID || '0') || '0';
}

function providerFeatureId(feature: UtahTrailFeature): string {
  return `utah-sgid-trails:${sourceFeatureKey(feature)}`;
}

function routeBaseName(attributes: Record<string, unknown>): string {
  return cleanString(attributes.PrimaryNam) ||
    cleanString(attributes.SystemName) ||
    cleanString(attributes.ID) ||
    'Unnamed Utah Trail';
}

function publicIdForFeature(feature: UtahTrailFeature): string {
  return slugify([
    'utah-sgid-trail',
    routeBaseName(feature.attributes ?? {}),
    `feature ${sourceFeatureKey(feature)}`,
  ].join(' '));
}

function routeName(attributes: Record<string, unknown>): string {
  const name = toTitleCase(routeBaseName(attributes));
  const county = toTitleCase(cleanString(attributes.County));
  return county ? `Utah SGID Trail ${name} - ${county} County` : `Utah SGID Trail ${name}`;
}

function estimateRemotenessScore(distanceMiles: number, attributes: Record<string, unknown>): number {
  const owner = cleanString(attributes.OwnerStewa).toLowerCase();
  const remoteOwnerBonus = /blm|tribal|federal|state/i.test(owner) ? 0.9 : 0.4;
  return Number(clampNumber(3.8 + remoteOwnerBonus + Math.min(2.2, distanceMiles / 22), 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.45));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  return Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
}

function publishedDistanceMiles(attributes: Record<string, unknown>): number | null {
  const shapeMeters = cleanNumber(attributes.Shape__Length);
  if (shapeMeters && shapeMeters > 0) return shapeMeters / METERS_PER_MILE;
  return null;
}

function routeIntelligence(args: {
  attributes: Record<string, unknown>;
  distanceMiles: number;
  estimatedDurationMinutes: number;
  calculatedDistanceMiles: number;
}) {
  return {
    sourceAdapter: 'utah_sgid_trails',
    sourceLayerName: 'Utah SGID Trails and Pathways',
    motorizedAllowed: cleanString(args.attributes.MotorizedA),
    status: cleanString(args.attributes.Status),
    designation: cleanString(args.attributes.Designated),
    trailClass: cleanString(args.attributes.Class),
    surface: cleanString(args.attributes.SurfaceTyp),
    cartographyCode: cleanString(args.attributes.CartoCode),
    ownerSteward: cleanString(args.attributes.OwnerStewa),
    county: cleanString(args.attributes.County),
    transportNetwork: cleanString(args.attributes.TransNetwo),
    dataSource: cleanString(args.attributes.DataSource),
    comments: cleanString(args.attributes.Comments),
    vehicleFit: ['full_size_4x4', 'atv', 'utv', 'motorcycle'],
    remotenessBasis: 'estimated_from_utah_sgid_distance_owner_and_statewide_trail_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_utah_sgid_trail_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    distanceMiles: args.distanceMiles,
    calculatedDistanceMiles: Number(args.calculatedDistanceMiles.toFixed(3)),
    estimatedDurationMinutes: args.estimatedDurationMinutes,
    sourceEditDate: cleanString(args.attributes.last_edi_1) || null,
    caveat: UTAH_TRAILS_CAVEAT,
  };
}

export function utahTrailsSourceUpsert(lastCheckedAt = new Date().toISOString()) {
  return {
    provider_id: UTAH_TRAILS_SOURCE.providerId,
    name: UTAH_TRAILS_SOURCE.name,
    source_type: 'state_agency',
    authority: 'official_access',
    source_uri: UTAH_TRAILS_SOURCE.sourceUri,
    attribution: UTAH_TRAILS_SOURCE.attribution,
    license: 'state agency published ArcGIS FeatureServer layer',
    refresh_frequency: 'agency maintained FeatureServer',
    status: 'active',
    last_checked_at: lastCheckedAt,
  };
}

export function normalizeUtahTrailFeatureCollection(payload: unknown): UtahTrailFeature[] {
  const record = payload && typeof payload === 'object' ? payload as { features?: unknown } : {};
  if (!Array.isArray(record.features)) return [];
  return record.features
    .filter((feature): feature is Record<string, unknown> => !!feature && typeof feature === 'object')
    .map((feature) => ({
      attributes: feature.attributes && typeof feature.attributes === 'object'
        ? feature.attributes as Record<string, unknown>
        : {},
      geometry: feature.geometry && typeof feature.geometry === 'object'
        ? feature.geometry as UtahTrailFeature['geometry']
        : undefined,
    }));
}

export function featureToUtahTrailRouteUpsert(
  feature: UtahTrailFeature,
  context: UtahTrailRouteContext,
) {
  const attributes = feature.attributes ?? {};
  if (!isYes(attributes.MotorizedA)) return null;
  if (!/^existing$/i.test(cleanString(attributes.Status))) return null;

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
  const vehicleFit = ['full_size_4x4', 'atv', 'utv', 'motorcycle'];
  const coverage = 78;
  const routeSourceLayer = 'Utah SGID Trails and Pathways: TrailsAndPathways';
  const warnings = [
    UTAH_TRAILS_CAVEAT,
    'Check current closures, permits, trail signage, land ownership, fire restrictions, weather, and local travel-management orders before travel.',
    'Utah SGID is a statewide trail inventory; ECS does not treat it as a current local closure authority or a guarantee that every motorized class is suitable.',
  ];

  const verifiedRoute = {
    public_id: publicId,
    name: routeName(attributes),
    description: 'Utah AGRC official statewide Trails and Pathways geometry with a motorized-allowed field. ECS publishes existing motorized-allowed records as official source-backed route recommendations with visible local-access caveats.',
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
    route_intelligence: routeIntelligence({ attributes, distanceMiles, estimatedDurationMinutes, calculatedDistanceMiles }),
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
    confidence_score: 80,
    confidence_reasons: [
      'Utah AGRC publishes this statewide Trails and Pathways layer with a motorized-allowed field.',
      'Only existing records with MotorizedA = Yes are promoted from the official source.',
    ],
    warning_reasons: warnings,
    blocker_reasons: [],
    closure_summaries: [],
    community_signal: {
      sourceAdapter: 'utah_sgid_trails',
      providerFeatureId: providerId,
      featureId: sourceFeatureKey(feature),
      primaryName: cleanString(attributes.PrimaryNam) || null,
      county: cleanString(attributes.County) || null,
      ownerSteward: cleanString(attributes.OwnerStewa) || null,
      surface: cleanString(attributes.SurfaceTyp) || null,
      trailClass: cleanString(attributes.Class) || null,
      motorizedAllowed: cleanString(attributes.MotorizedA),
      calculatedDistanceMiles: Number(calculatedDistanceMiles.toFixed(3)),
      publishedDistanceMiles: publishedMiles,
      dataSource: cleanString(attributes.DataSource) || null,
    },
    tags: uniqueStrings([
      'Utah SGID Trails and Pathways',
      'state agency',
      cleanString(attributes.County),
      cleanString(attributes.OwnerStewa),
      cleanString(attributes.SurfaceTyp),
      cleanString(attributes.Class),
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
    source_uri: UTAH_TRAILS_SOURCE.sourceUri,
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
      officialFeatureServerUrl: UTAH_TRAILS_SOURCE.sourceUri,
      county: cleanString(attributes.County) || null,
      ownerSteward: cleanString(attributes.OwnerStewa) || null,
      motorizedAllowed: cleanString(attributes.MotorizedA),
      caveat: UTAH_TRAILS_CAVEAT,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}

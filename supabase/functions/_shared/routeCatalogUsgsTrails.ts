export type UsgsTrailsArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: {
    paths?: unknown;
  };
};

export type UsgsTrailsRouteContext = {
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
};

export const USGS_TRAILS_SOURCE = {
  providerId: 'usgs_digital_trails',
  name: 'USGS National Digital Trails',
  sourceUri: 'https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/37',
  attribution: 'U.S. Geological Survey, The National Map National Transportation Dataset',
};

export const USGS_TRAILS_LAYER = {
  id: 37,
  name: 'Trails',
  sourceLayer: 'USGS National Transportation Dataset: Trails',
  url: USGS_TRAILS_SOURCE.sourceUri,
};

const USGS_TRAILS_CAVEAT =
  'USGS National Digital Trails is supplemental geometry/context only for ECS route matching; it does not establish legal motorized access, current conditions, closures, or passability.';

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

function sqlNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
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

function normalizePath(value: unknown): number[][] {
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

function normalizePaths(feature: UsgsTrailsArcGisFeature): number[][][] {
  const rawPaths = feature.geometry?.paths;
  if (!Array.isArray(rawPaths)) return [];
  return rawPaths.map(normalizePath).filter((path) => path.length >= 2);
}

function centerFromPaths(paths: number[][][]): { latitude: number; longitude: number } | null {
  const points = paths.flat();
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

function routeGeometryFromPaths(paths: number[][][]): { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] } | null {
  if (paths.length === 0) return null;
  if (paths.length === 1) return { type: 'LineString', coordinates: paths[0] };
  return { type: 'MultiLineString', coordinates: paths };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function orderedVehicleFit(values: string[]): string[] {
  const order = ['full_size_4x4', 'atv', 'utv', 'motorcycle', 'snowmobile'];
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}

function isYes(value: unknown): boolean {
  return /^y|yes|true|1$/i.test(cleanString(value));
}

function vehicleFitFromAttributes(attributes: Record<string, unknown>): string[] {
  const fit = new Set<string>();
  if (isYes(attributes.ohvover50inches)) fit.add('full_size_4x4');
  if (isYes(attributes.ohvisorunder50inches)) {
    fit.add('atv');
    fit.add('utv');
  }
  if (isYes(attributes.motorcycle)) fit.add('motorcycle');
  if (isYes(attributes.osvm) || isYes(attributes.snowmobile)) fit.add('snowmobile');
  return orderedVehicleFit(Array.from(fit));
}

function isMotorizedTerraTrail(attributes: Record<string, unknown>): boolean {
  if (!/^terra trail$/i.test(cleanString(attributes.trailtype))) return false;
  return vehicleFitFromAttributes(attributes).length > 0;
}

function routeNumber(attributes: Record<string, unknown>): string {
  return cleanString(attributes.trailnumber);
}

function sourceCode(attributes: Record<string, unknown>): string {
  return cleanString(attributes.primarytrailmaintainer || attributes.sourceoriginator)
    .replace(/^U\.?S\.?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceFeatureKey(attributes: Record<string, unknown>): string {
  return cleanString(attributes.objectid || attributes.globalid || attributes.permanentidentifier || '0') || '0';
}

function providerFeatureId(attributes: Record<string, unknown>): string {
  return `usgs-trails:${sourceFeatureKey(attributes)}`;
}

function routeName(attributes: Record<string, unknown>): string {
  const number = routeNumber(attributes);
  const rawName = cleanString(attributes.name);
  const titleName = rawName ? toTitleCase(rawName) : '';
  if (number && titleName) return `USGS Trail ${number} ${titleName}`;
  if (number) return `USGS Trail ${number}`;
  if (titleName) return `USGS Trail ${titleName}`;
  return 'USGS Trail Segment';
}

function publicIdForFeature(attributes: Record<string, unknown>): string {
  return slugify([
    'usgs-trails',
    sourceCode(attributes),
    'trail',
    routeNumber(attributes),
    cleanString(attributes.name),
    `feature ${sourceFeatureKey(attributes)}`,
  ].filter(Boolean).join(' '));
}

function estimateRemotenessScore(distanceMiles: number): number {
  return Number(clampNumber(4.5 + Math.min(2.5, distanceMiles / 16), 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.5));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  return Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
}

function routeIntelligence(args: {
  distanceMiles: number;
  estimatedDurationMinutes: number;
}) {
  return {
    sourceAdapter: 'usgs_digital_trails',
    sourceLayerId: USGS_TRAILS_LAYER.id,
    sourceLayerName: USGS_TRAILS_LAYER.name,
    remotenessBasis: 'estimated_from_usgs_trail_distance_and_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_usgs_trail_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    distanceMiles: args.distanceMiles,
    estimatedDurationMinutes: args.estimatedDurationMinutes,
    caveat: USGS_TRAILS_CAVEAT,
  };
}

export function usgsTrailsSourceUpsert(lastCheckedAt = new Date().toISOString()) {
  return {
    provider_id: USGS_TRAILS_SOURCE.providerId,
    name: USGS_TRAILS_SOURCE.name,
    source_type: 'federal_agency',
    authority: 'supplemental_geometry',
    source_uri: USGS_TRAILS_SOURCE.sourceUri,
    attribution: USGS_TRAILS_SOURCE.attribution,
    license: 'public domain / agency published terms',
    refresh_frequency: 'agency published schedule',
    status: 'active',
    last_checked_at: lastCheckedAt,
  };
}

export function buildUsgsTrailsWhereClause(options: { minMiles?: number } = {}): string {
  const clauses = [
    "trailtype = 'Terra Trail'",
    "(motorcycle = 'Y' OR ohvover50inches = 'Y' OR ohvisorunder50inches = 'Y' OR osvm = 'Y')",
  ];
  const minMiles = Math.max(0, Number(options.minMiles ?? 1));
  if (minMiles > 0) clauses.push(`lengthmiles >= ${sqlNumber(minMiles)}`);
  return clauses.join(' AND ');
}

export type UsgsTrailsBbox = {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
};

export type UsgsTrailsBboxPreset = {
  key: string;
  label: string;
  bbox: UsgsTrailsBbox;
};

export function normalizeUsgsTrailsBbox(value: unknown): UsgsTrailsBbox | null {
  const source = Array.isArray(value)
    ? { xmin: value[0], ymin: value[1], xmax: value[2], ymax: value[3] }
    : value && typeof value === 'object'
      ? value as Record<string, unknown>
      : null;
  if (!source) return null;
  const xmin = Number(source.xmin ?? source.west);
  const ymin = Number(source.ymin ?? source.south);
  const xmax = Number(source.xmax ?? source.east);
  const ymax = Number(source.ymax ?? source.north);
  if (
    !Number.isFinite(xmin) ||
    !Number.isFinite(ymin) ||
    !Number.isFinite(xmax) ||
    !Number.isFinite(ymax) ||
    xmin >= xmax ||
    ymin >= ymax ||
    Math.abs(xmin) > 180 ||
    Math.abs(xmax) > 180 ||
    Math.abs(ymin) > 90 ||
    Math.abs(ymax) > 90
  ) {
    return null;
  }
  return { xmin, ymin, xmax, ymax };
}

export function normalizeUsgsTrailsBboxes(value: unknown): UsgsTrailsBboxPreset[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((entry, index) => {
      const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      const bbox = normalizeUsgsTrailsBbox(record.bbox ?? record);
      if (!bbox) return null;
      return {
        key: cleanString(record.key) || `bbox_${index + 1}`,
        label: cleanString(record.label) || cleanString(record.key) || `USGS Trails bbox ${index + 1}`,
        bbox,
      };
    })
    .filter((entry): entry is UsgsTrailsBboxPreset => !!entry);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeUsgsTrailsFeatureCollection(payload: unknown): UsgsTrailsArcGisFeature[] {
  const record = payload && typeof payload === 'object' ? payload as { features?: unknown } : {};
  if (!Array.isArray(record.features)) return [];
  return record.features
    .filter((feature): feature is Record<string, unknown> => !!feature && typeof feature === 'object')
    .map((feature) => ({
      attributes: feature.attributes && typeof feature.attributes === 'object'
        ? feature.attributes as Record<string, unknown>
        : {},
      geometry: feature.geometry && typeof feature.geometry === 'object'
        ? feature.geometry as UsgsTrailsArcGisFeature['geometry']
        : undefined,
    }));
}

export function arcGisFeatureToUsgsTrailsRouteUpsert(
  feature: UsgsTrailsArcGisFeature,
  context: UsgsTrailsRouteContext,
) {
  const attributes = feature.attributes ?? {};
  const distanceMiles = cleanNumber(attributes.lengthmiles ?? attributes.networklength);
  const minMiles = Math.max(0, Number(context.minMiles ?? 1));
  if (distanceMiles == null || distanceMiles < minMiles) return null;
  if (!isMotorizedTerraTrail(attributes)) return null;

  const paths = normalizePaths(feature);
  const routeGeometry = routeGeometryFromPaths(paths);
  const center = centerFromPaths(paths);
  if (!routeGeometry || !center) return null;

  const vehicleFit = vehicleFitFromAttributes(attributes);
  if (vehicleFit.length === 0) return null;

  const publicId = publicIdForFeature(attributes);
  const providerId = providerFeatureId(attributes);
  const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 18));

  const verifiedRoute = {
    public_id: publicId,
    name: routeName(attributes),
    description: 'USGS National Digital Trails supplemental motorized-use geometry. ECS uses this for route matching/context only, not as legal-access authority.',
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
    official_access_coverage_pct: 0,
    unknown_access_coverage_pct: 100,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: isYes(attributes.osvm) ? 1 : 0,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'geometry_only',
    recommendation_status: 'not_recommended',
    review_status: 'approved',
    confidence_score: 58,
    confidence_reasons: [
      'USGS National Digital Trails supplied usable motorized-use geometry.',
      `Source originator: ${cleanString(attributes.sourceoriginator) || 'unknown'}.`,
    ],
    warning_reasons: [
      USGS_TRAILS_CAVEAT,
      'Supplemental geometry awaits official legal-access overlay before ECS can recommend it.',
    ],
    blocker_reasons: ['USGS National Digital Trails does not establish legal motorized access for public recommendation.'],
    closure_summaries: [],
    community_signal: {
      sourceAdapter: 'usgs_digital_trails',
      sourceLayerId: USGS_TRAILS_LAYER.id,
      providerFeatureId: providerId,
      permanentIdentifier: cleanString(attributes.permanentidentifier) || null,
      sourceOriginator: cleanString(attributes.sourceoriginator) || null,
      primaryTrailMaintainer: cleanString(attributes.primarytrailmaintainer) || null,
    },
    tags: uniqueStrings([
      'USGS Digital Trails',
      'supplemental geometry',
      cleanString(attributes.trailtype),
      cleanString(attributes.primarytrailmaintainer),
      cleanString(attributes.sourceoriginator),
      cleanString(attributes.nationaltraildesignation),
    ]),
    last_verified_at: context.sourceLastVerifiedAt,
    stale_at: addDaysIso(context.sourceLastVerifiedAt, 180),
  };

  const rawSourceFeature = {
    route_source_id: context.sourceId,
    ingest_run_id: context.ingestRunId ?? null,
    provider_feature_id: providerId,
    source_layer: USGS_TRAILS_LAYER.sourceLayer,
    source_uri: USGS_TRAILS_LAYER.url,
    payload_hash: stablePayloadHash(feature),
    geometry: null,
    properties: {
      attributes,
      geometry: routeGeometry,
      routeCatalogPublicId: publicId,
    },
    last_seen_at: context.sourceLastVerifiedAt,
  };

  const verifiedRouteSource = {
    route_source_id: context.sourceId,
    source_role: 'supplemental',
    coverage_pct: 0,
    last_verified_at: context.sourceLastVerifiedAt,
    metadata: {
      providerFeatureId: providerId,
      sourceLayer: USGS_TRAILS_LAYER.sourceLayer,
      sourceLayerId: USGS_TRAILS_LAYER.id,
      permanentIdentifier: cleanString(attributes.permanentidentifier) || null,
      sourceOriginator: cleanString(attributes.sourceoriginator) || null,
      trailType: cleanString(attributes.trailtype),
      caveat: USGS_TRAILS_CAVEAT,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}

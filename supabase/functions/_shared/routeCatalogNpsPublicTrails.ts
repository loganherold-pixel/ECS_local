export type NpsPublicTrailsArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: {
    paths?: unknown;
  };
};

export type NpsPublicTrailsRouteContext = {
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
};

export const NPS_PUBLIC_TRAILS_SOURCE = {
  providerId: 'nps_public_trails',
  name: 'NPS Public Trails Geographic',
  sourceUri: 'https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails_Geographic/FeatureServer/0',
  attribution: 'National Park Service Public Trails Geographic Dataset',
};

export const NPS_PUBLIC_TRAILS_LAYER = {
  id: 0,
  name: 'Trails',
  sourceLayer: 'NPS Public Trails Geographic: Trails',
  url: NPS_PUBLIC_TRAILS_SOURCE.sourceUri,
};

const NPS_PUBLIC_TRAILS_CAVEAT =
  'NPS Public Trails is official park visitor-use trail geometry/context, but park unit rules and current alerts must be reviewed before ECS can treat it as overland legal access, current condition, closure, or passability authority.';

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function sqlNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
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

function normalizePaths(feature: NpsPublicTrailsArcGisFeature): number[][][] {
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

function distanceMilesFromPaths(paths: number[][][]): number {
  return paths.reduce((total, path) => {
    let pathTotal = 0;
    for (let index = 1; index < path.length; index += 1) {
      pathTotal += haversineMiles(path[index - 1], path[index]);
    }
    return total + pathTotal;
  }, 0);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function orderedVehicleFit(values: string[]): string[] {
  const order = ['full_size_4x4', 'atv', 'utv', 'motorcycle', 'snowmobile'];
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}

function normalizedUseText(attributes: Record<string, unknown>): string {
  return cleanString(attributes.TRLUSE)
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function vehicleFitFromAttributes(attributes: Record<string, unknown>): string[] {
  const use = normalizedUseText(attributes);
  const fit = new Set<string>();
  if (/four-wheel drive|four wheel drive|4wd|4x4|>\s*50/.test(use)) fit.add('full_size_4x4');
  if (/all-terrain vehicle|\batv\b/.test(use)) {
    fit.add('atv');
    fit.add('utv');
  }
  if (/motorcycle/.test(use)) fit.add('motorcycle');
  if (/snowmobile/.test(use)) fit.add('snowmobile');
  if (/motorized/.test(use) && !/watercraft/.test(use) && fit.size === 0) {
    fit.add('full_size_4x4');
    fit.add('atv');
    fit.add('utv');
    fit.add('motorcycle');
  }
  return orderedVehicleFit(Array.from(fit));
}

function isPublicDisplay(attributes: Record<string, unknown>): boolean {
  return /^public map display$/i.test(cleanString(attributes.PUBLICDISPLAY));
}

function isUnrestricted(attributes: Record<string, unknown>): boolean {
  return /^unrestricted$/i.test(cleanString(attributes.DATAACCESS));
}

function isExistingOrOpen(attributes: Record<string, unknown>): boolean {
  return /^(existing|open)$/i.test(cleanString(attributes.TRLSTATUS));
}

function isTerraTrail(attributes: Record<string, unknown>): boolean {
  return /terra/i.test(cleanString(attributes.TRLTYPE));
}

function isNpsMotorizedPublicTrail(attributes: Record<string, unknown>): boolean {
  return (
    isPublicDisplay(attributes) &&
    isUnrestricted(attributes) &&
    isExistingOrOpen(attributes) &&
    isTerraTrail(attributes) &&
    vehicleFitFromAttributes(attributes).length > 0
  );
}

function sourceFeatureKey(attributes: Record<string, unknown>): string {
  return cleanString(attributes.OBJECTID || attributes.FEATUREID || attributes.GEOMETRYID || '0') || '0';
}

function providerFeatureId(attributes: Record<string, unknown>): string {
  return `nps-public-trails:${sourceFeatureKey(attributes)}`;
}

function routeName(attributes: Record<string, unknown>): string {
  const rawName = cleanString(attributes.TRLNAME || attributes.MAPLABEL || attributes.TRLALTNAME);
  const titleName = rawName ? toTitleCase(rawName) : 'Unnamed Public Trail';
  const unitName = cleanString(attributes.UNITNAME);
  return unitName ? `NPS Trail ${titleName} - ${unitName}` : `NPS Trail ${titleName}`;
}

function publicIdForFeature(attributes: Record<string, unknown>): string {
  return slugify([
    'nps-public-trails',
    cleanString(attributes.UNITCODE),
    cleanString(attributes.TRLNAME || attributes.MAPLABEL || attributes.TRLALTNAME),
    `feature ${sourceFeatureKey(attributes)}`,
  ].filter(Boolean).join(' '));
}

function estimateRemotenessScore(distanceMiles: number): number {
  return Number(clampNumber(3.5 + Math.min(2.5, distanceMiles / 12), 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.5));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  return Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
}

function seasonalRestrictionCount(attributes: Record<string, unknown>): number {
  const seasonal = cleanString(attributes.SEASONAL);
  const description = cleanString(attributes.SEASDESC);
  return /^yes$/i.test(seasonal) || description.length > 0 ? 1 : 0;
}

function npsPublicTrailsRouteIntelligence(args: {
  distanceMiles: number;
  estimatedDurationMinutes: number;
}) {
  return {
    sourceAdapter: 'nps_public_trails',
    sourceLayerId: NPS_PUBLIC_TRAILS_LAYER.id,
    sourceLayerName: NPS_PUBLIC_TRAILS_LAYER.name,
    remotenessBasis: 'estimated_from_nps_public_trail_distance_and_park_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_nps_public_trail_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    distanceMiles: args.distanceMiles,
    estimatedDurationMinutes: args.estimatedDurationMinutes,
    caveat: NPS_PUBLIC_TRAILS_CAVEAT,
  };
}

export function npsPublicTrailsSourceUpsert(lastCheckedAt = new Date().toISOString()) {
  return {
    provider_id: NPS_PUBLIC_TRAILS_SOURCE.providerId,
    name: NPS_PUBLIC_TRAILS_SOURCE.name,
    source_type: 'federal_agency',
    authority: 'official_park_trail_context',
    source_uri: NPS_PUBLIC_TRAILS_SOURCE.sourceUri,
    attribution: NPS_PUBLIC_TRAILS_SOURCE.attribution,
    license: 'agency published terms',
    refresh_frequency: 'agency published schedule',
    status: 'active',
    last_checked_at: lastCheckedAt,
  };
}

export function buildNpsPublicTrailsWhereClause(): string {
  return [
    "PUBLICDISPLAY = 'Public Map Display'",
    "DATAACCESS = 'Unrestricted'",
    "TRLSTATUS in ('Existing','Open')",
    "TRLTYPE LIKE '%Terra%'",
    [
      "TRLUSE LIKE '%Four-Wheel Drive%'",
      "TRLUSE LIKE '%All-Terrain Vehicle%'",
      "TRLUSE LIKE '%ATV%'",
      "TRLUSE LIKE '%Motorcycle%'",
      "TRLUSE LIKE '%Motorized%'",
      "TRLUSE LIKE '%Snowmobile%'",
    ].join(' OR '),
  ].map((clause) => clause.includes(' OR ') ? `(${clause})` : clause).join(' AND ');
}

export type NpsPublicTrailsBbox = {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
};

export function normalizeNpsPublicTrailsBbox(value: unknown): NpsPublicTrailsBbox | null {
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

export function normalizeNpsPublicTrailsFeatureCollection(payload: unknown): NpsPublicTrailsArcGisFeature[] {
  const record = payload && typeof payload === 'object' ? payload as { features?: unknown } : {};
  if (!Array.isArray(record.features)) return [];
  return record.features
    .filter((feature): feature is Record<string, unknown> => !!feature && typeof feature === 'object')
    .map((feature) => ({
      attributes: feature.attributes && typeof feature.attributes === 'object'
        ? feature.attributes as Record<string, unknown>
        : {},
      geometry: feature.geometry && typeof feature.geometry === 'object'
        ? feature.geometry as NpsPublicTrailsArcGisFeature['geometry']
        : undefined,
    }));
}

export function arcGisFeatureToNpsPublicTrailsRouteUpsert(
  feature: NpsPublicTrailsArcGisFeature,
  context: NpsPublicTrailsRouteContext,
) {
  const attributes = feature.attributes ?? {};
  if (!isNpsMotorizedPublicTrail(attributes)) return null;

  const paths = normalizePaths(feature);
  const routeGeometry = routeGeometryFromPaths(paths);
  const center = centerFromPaths(paths);
  if (!routeGeometry || !center) return null;

  const distanceMiles = distanceMilesFromPaths(paths);
  const minMiles = Math.max(0, Number(context.minMiles ?? 0.1));
  if (distanceMiles < minMiles) return null;

  const vehicleFit = vehicleFitFromAttributes(attributes);
  if (vehicleFit.length === 0) return null;

  const publicId = publicIdForFeature(attributes);
  const providerId = providerFeatureId(attributes);
  const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 18));
  const seasonDescription = cleanString(attributes.SEASDESC);
  const seasonalCount = seasonalRestrictionCount(attributes);

  const verifiedRoute = {
    public_id: publicId,
    name: routeName(attributes),
    description: 'NPS public trail geometry with motorized-use context. ECS stores this for official park-context curation, not as a finished overland route recommendation.',
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
    route_intelligence: npsPublicTrailsRouteIntelligence({ distanceMiles, estimatedDurationMinutes }),
    official_access_coverage_pct: 60,
    unknown_access_coverage_pct: 40,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: seasonalCount,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'partially_verified',
    recommendation_status: 'not_recommended',
    review_status: 'approved',
    confidence_score: 74,
    confidence_reasons: [
      'NPS Public Trails lists this as public-display, unrestricted, existing/open terra trail geometry.',
      `NPS trail-use field: ${cleanString(attributes.TRLUSE) || 'unknown'}.`,
    ],
    warning_reasons: [
      NPS_PUBLIC_TRAILS_CAVEAT,
      'NPS trail context awaits ECS route curation before public recommendation.',
      ...(seasonDescription ? [`NPS seasonal note: ${seasonDescription}`] : []),
    ],
    blocker_reasons: ['NPS public trail geometry is not yet reviewed with park unit legal access, current alerts, closures, and ECS route curation.'],
    closure_summaries: [],
    community_signal: {
      sourceAdapter: 'nps_public_trails',
      sourceLayerId: NPS_PUBLIC_TRAILS_LAYER.id,
      providerFeatureId: providerId,
      unitCode: cleanString(attributes.UNITCODE) || null,
      unitName: cleanString(attributes.UNITNAME) || null,
      trailUse: cleanString(attributes.TRLUSE) || null,
      publicDisplay: cleanString(attributes.PUBLICDISPLAY) || null,
      dataAccess: cleanString(attributes.DATAACCESS) || null,
    },
    tags: uniqueStrings([
      'NPS Public Trails',
      'official park context',
      cleanString(attributes.UNITCODE),
      cleanString(attributes.UNITNAME),
      cleanString(attributes.TRLTYPE),
      cleanString(attributes.TRLUSE),
      seasonalCount > 0 ? 'seasonal' : '',
    ]),
    last_verified_at: context.sourceLastVerifiedAt,
    stale_at: addDaysIso(context.sourceLastVerifiedAt, 180),
  };

  const rawSourceFeature = {
    route_source_id: context.sourceId,
    ingest_run_id: context.ingestRunId ?? null,
    provider_feature_id: providerId,
    source_layer: NPS_PUBLIC_TRAILS_LAYER.sourceLayer,
    source_uri: NPS_PUBLIC_TRAILS_LAYER.url,
    payload_hash: stablePayloadHash(feature),
    geometry: null,
    properties: {
      attributes,
      geometry: routeGeometry,
      routeCatalogPublicId: publicId,
      calculatedDistanceMiles: Number(distanceMiles.toFixed(3)),
    },
    last_seen_at: context.sourceLastVerifiedAt,
  };

  const verifiedRouteSource = {
    route_source_id: context.sourceId,
    source_role: 'primary',
    coverage_pct: 60,
    last_verified_at: context.sourceLastVerifiedAt,
    metadata: {
      providerFeatureId: providerId,
      sourceLayer: NPS_PUBLIC_TRAILS_LAYER.sourceLayer,
      sourceLayerId: NPS_PUBLIC_TRAILS_LAYER.id,
      unitCode: cleanString(attributes.UNITCODE) || null,
      unitName: cleanString(attributes.UNITNAME) || null,
      trailStatus: cleanString(attributes.TRLSTATUS),
      trailUse: cleanString(attributes.TRLUSE),
      caveat: NPS_PUBLIC_TRAILS_CAVEAT,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}

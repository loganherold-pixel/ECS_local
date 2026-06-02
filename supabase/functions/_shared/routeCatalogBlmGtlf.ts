export type BlmGtlfLayer = {
  id: 0 | 1 | 2 | 3;
  kind: 'road' | 'trail';
  name: string;
  sourceLayer: string;
  url: string;
  motorizedUse: 'public' | 'limited';
};

export type BlmGtlfArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: {
    paths?: unknown;
  };
};

export type BlmGtlfRouteContext = {
  layer: BlmGtlfLayer;
  sourceId: string;
  sourceLastVerifiedAt: string;
  ingestRunId?: string | null;
  minMiles?: number;
};

export type BlmGtlfRouteUpsert = NonNullable<ReturnType<typeof arcGisFeatureToBlmGtlfRouteUpsert>>;
export type BlmGtlfAggregateRouteUpsert = {
  verifiedRoute: Record<string, unknown>;
  verifiedRouteSource: Record<string, unknown>;
  segmentPublicIds: string[];
  segmentProviderFeatureIds: string[];
};

type BlmGtlfAggregationKind = 'blm_gtlf_route_identity' | 'blm_gtlf_source_feature';

export const BLM_GTLF_SOURCE = {
  providerId: 'blm_gtlf',
  name: 'BLM National Ground Transportation Linear Features Public Display',
  sourceUri: 'https://gis.blm.gov/arcgis/rest/services/transportation/BLM_Natl_GTLF_Public_Display/MapServer',
  attribution: 'Bureau of Land Management Ground Transportation Linear Features',
};

export const BLM_GTLF_LAYERS: BlmGtlfLayer[] = [
  {
    id: 0,
    kind: 'road',
    name: 'Roads Managed for Public Motorized Use',
    sourceLayer: 'BLM GTLF: Roads Managed for Public Motorized Use',
    url: `${BLM_GTLF_SOURCE.sourceUri}/0`,
    motorizedUse: 'public',
  },
  {
    id: 1,
    kind: 'road',
    name: 'Roads Managed for Limited Public Motorized Use',
    sourceLayer: 'BLM GTLF: Roads Managed for Limited Public Motorized Use',
    url: `${BLM_GTLF_SOURCE.sourceUri}/1`,
    motorizedUse: 'limited',
  },
  {
    id: 2,
    kind: 'trail',
    name: 'Trails Managed for Public Motorized Use',
    sourceLayer: 'BLM GTLF: Trails Managed for Public Motorized Use',
    url: `${BLM_GTLF_SOURCE.sourceUri}/2`,
    motorizedUse: 'public',
  },
  {
    id: 3,
    kind: 'trail',
    name: 'Trails Managed for Limited Public Motorized Use',
    sourceLayer: 'BLM GTLF: Trails Managed for Limited Public Motorized Use',
    url: `${BLM_GTLF_SOURCE.sourceUri}/3`,
    motorizedUse: 'limited',
  },
];

const BLM_GTLF_CAVEAT =
  'BLM GTLF is official public transportation source data, but users must verify current use limitations and restrictions with the local BLM office before travel.';

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function cleanNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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

function estimateBlmRemotenessScore(distanceMiles: number): number {
  return Number(clampNumber(5.5 + Math.min(2.5, distanceMiles / 14), 1, 10).toFixed(1));
}

function estimateMinimumFuelRangeMiles(distanceMiles: number): number {
  return Math.max(10, Math.ceil(distanceMiles * 1.6));
}

function estimateMinimumWaterCapacityGallons(estimatedDurationMinutes: number): number {
  return Math.max(1, Math.ceil(estimatedDurationMinutes / 480));
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

function normalizePaths(feature: BlmGtlfArcGisFeature): number[][][] {
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
  const order = ['highway_legal_4x4', 'full_size_4x4', 'atv', 'utv', 'motorcycle', 'snowmobile'];
  const unique = new Set(values);
  return order.filter((value) => unique.has(value));
}

function vehicleFitFromAttributes(layer: BlmGtlfLayer, attributes: Record<string, unknown>): string[] {
  const allowMode = cleanString(attributes.PLAN_ALLOW_MODE_TRNSPRT).toUpperCase();
  const fit = new Set<string>();

  if (allowMode.includes('STRT_LGL_VEH') || allowMode.includes('ALL_MOTO_VEH')) {
    fit.add('highway_legal_4x4');
    fit.add('full_size_4x4');
  }
  if (allowMode.includes('TECH_HI_CLEAR_VEH_ONLY') || allowMode.includes('TECH_VEH_SHARED')) {
    fit.add('full_size_4x4');
  }
  if (allowMode.includes('ATV') || allowMode.includes('TECH_VEH_SHARED')) {
    fit.add('atv');
    fit.add('utv');
  }
  if (allowMode.includes('UTV')) fit.add('utv');
  if (allowMode.includes('MTC') || allowMode.includes('MOTORCYCLE') || allowMode.includes('TECH_VEH_SHARED')) fit.add('motorcycle');
  if (allowMode.includes('SNOW_MOTO')) fit.add('snowmobile');

  if (fit.size === 0 && layer.kind === 'road' && /^open$/i.test(cleanString(attributes.PLAN_OHV_ROUTE_DSGNTN))) {
    fit.add('full_size_4x4');
  }

  return orderedVehicleFit(Array.from(fit));
}

function isPublicMotorizedFeature(attributes: Record<string, unknown>): boolean {
  const externalDistribution = cleanString(attributes.DSTRBTE_EXTRNL_CODE).toUpperCase();
  if (externalDistribution && externalDistribution !== 'YES') return false;
  const authority = cleanString(attributes.PLAN_ROUTE_DSGNTN_AUTH).toUpperCase();
  if (authority && authority !== 'BLM') return false;
  const ohvDesignation = cleanString(attributes.PLAN_OHV_ROUTE_DSGNTN).toUpperCase();
  if (ohvDesignation !== 'OPEN' && ohvDesignation !== 'LIMITED') return false;
  const mode = cleanString(attributes.PLAN_MODE_TRNSPRT).toUpperCase();
  if (mode && mode !== 'MOTORIZED') return false;
  return true;
}

function routePlanId(attributes: Record<string, unknown>): string {
  const planId = cleanString(attributes.ROUTE_PLAN_ID);
  if (planId) return planId;
  const famsId = cleanString(attributes.FAMS_ID);
  if (famsId && !/^none$/i.test(famsId)) return famsId;
  return '';
}

function sourceFeatureKey(attributes: Record<string, unknown>): string {
  return cleanString(attributes.OBJECTID || attributes.GlobalID || '0') || '0';
}

function providerFeatureId(layer: BlmGtlfLayer, attributes: Record<string, unknown>): string {
  return `blm-gtlf:${layer.id}:${sourceFeatureKey(attributes)}`;
}

function routeName(layer: BlmGtlfLayer, attributes: Record<string, unknown>): string {
  const id = routePlanId(attributes);
  const rawName = cleanString(attributes.ROUTE_PRMRY_NM);
  const titleName = rawName ? toTitleCase(rawName) : '';
  const prefix = layer.kind === 'road' ? 'BLM Road' : 'BLM Trail';
  if (id && titleName) return `${prefix} ${id} ${titleName}`;
  if (id) return `${prefix} ${id}`;
  if (titleName) return `${prefix} ${titleName}`;
  return `${prefix} GTLF Segment`;
}

function publicIdForFeature(layer: BlmGtlfLayer, attributes: Record<string, unknown>): string {
  const adminState = cleanString(attributes.ADMIN_ST).toLowerCase();
  return slugify([
    'blm-gtlf',
    adminState,
    layer.kind,
    routePlanId(attributes),
    cleanString(attributes.ROUTE_PRMRY_NM),
    `feature ${sourceFeatureKey(attributes)}`,
  ].filter(Boolean).join(' '));
}

function aggregationIdentity(layer: BlmGtlfLayer, attributes: Record<string, unknown>) {
  const adminState = cleanString(attributes.ADMIN_ST).toLowerCase();
  const planId = routePlanId(attributes);
  const rawName = cleanString(attributes.ROUTE_PRMRY_NM);
  const name = rawName ? toTitleCase(rawName) : '';
  const keyParts = [adminState, layer.kind, planId, name].filter(Boolean);
  if (!adminState) return null;
  if (keyParts.length > 2) {
    return {
      key: slugify(keyParts.join(' ')),
      publicIdParts: ['blm-gtlf', adminState, layer.kind, planId, name].filter(Boolean),
      adminState,
      planId,
      name,
      aggregation: 'blm_gtlf_route_identity' as BlmGtlfAggregationKind,
    };
  }

  const featureKey = sourceFeatureKey(attributes);
  if (!featureKey || featureKey === '0') return null;
  return {
    key: slugify([adminState, layer.kind, 'segment', featureKey].join(' ')),
    publicIdParts: ['blm-gtlf', adminState, layer.kind, 'segment', featureKey],
    adminState,
    planId: '',
    name: '',
    aggregation: 'blm_gtlf_source_feature' as BlmGtlfAggregationKind,
  };
}

function limitationWarning(attributes: Record<string, unknown>): string | null {
  const limitation = cleanString(attributes.OHV_ROUTE_DSGNTN_LIM);
  const explanation = cleanString(attributes.OHV_DSGNTN_LIM_EXPLAIN);
  if (!limitation && !explanation) return null;
  return `BLM GTLF limitation requires trip-date review: ${[limitation, explanation].filter(Boolean).join(' - ')}.`;
}

function blmGtlfRouteIntelligence(args: {
  layer: BlmGtlfLayer;
  distanceMiles: number;
  estimatedDurationMinutes: number;
}) {
  return {
    sourceAdapter: 'blm_gtlf',
    sourceLayerId: args.layer.id,
    sourceLayerName: args.layer.name,
    remotenessBasis: 'estimated_from_blm_gtlf_distance_and_public_land_context',
    remotenessDataState: 'estimated',
    campabilityDataState: 'unknown',
    resourceMarginBasis: 'estimated_from_blm_gtlf_distance_and_duration',
    fuelMarginDataState: 'estimated',
    waterMarginDataState: 'estimated',
    caveat: BLM_GTLF_CAVEAT,
  };
}

function lineStringsFromRouteGeometry(routeGeometry: Record<string, unknown>): number[][][] {
  if (routeGeometry.type === 'LineString' && Array.isArray(routeGeometry.coordinates)) {
    const path = normalizePath(routeGeometry.coordinates);
    return path.length >= 2 ? [path] : [];
  }
  if (routeGeometry.type === 'MultiLineString' && Array.isArray(routeGeometry.coordinates)) {
    return routeGeometry.coordinates
      .map(normalizePath)
      .filter((path) => path.length >= 2);
  }
  return [];
}

function sourceAttributes(segment: BlmGtlfRouteUpsert): Record<string, unknown> {
  const properties = segment.rawSourceFeature.properties;
  return properties && typeof properties === 'object' && 'attributes' in properties &&
    properties.attributes && typeof properties.attributes === 'object'
    ? properties.attributes as Record<string, unknown>
    : {};
}

function isRecommendableBlmAggregateSegment(layer: BlmGtlfLayer, segment: BlmGtlfRouteUpsert): boolean {
  const attributes = sourceAttributes(segment);
  if (layer.motorizedUse !== 'public') return false;
  if (!/^open$/i.test(cleanString(attributes.PLAN_OHV_ROUTE_DSGNTN))) return false;
  if (cleanString(attributes.PLAN_SEASON_RSTRCT_CODE)) return false;
  if (limitationWarning(attributes)) return false;
  if (Number(segment.verifiedRoute.active_closure_count ?? 0) > 0) return false;
  if (!Array.isArray(segment.verifiedRoute.vehicle_fit) || segment.verifiedRoute.vehicle_fit.length === 0) return false;
  if (lineStringsFromRouteGeometry(segment.verifiedRoute.route_geometry as Record<string, unknown>).length === 0) return false;
  return true;
}

export function blmGtlfSourceUpsert(lastCheckedAt = new Date().toISOString()) {
  return {
    provider_id: BLM_GTLF_SOURCE.providerId,
    name: BLM_GTLF_SOURCE.name,
    source_type: 'federal_agency',
    authority: 'official_access',
    source_uri: BLM_GTLF_SOURCE.sourceUri,
    attribution: BLM_GTLF_SOURCE.attribution,
    license: 'agency published terms',
    refresh_frequency: 'agency published schedule',
    status: 'active',
    last_checked_at: lastCheckedAt,
  };
}

export function buildBlmGtlfWhereClause(states: string[], options: { minMiles?: number } = {}): string {
  const adminStates = uniqueStrings(states.map((state) => state.trim().toUpperCase()).filter((state) => /^[A-Z]{2}$/.test(state)));
  const clauses = [
    "DSTRBTE_EXTRNL_CODE = 'YES'",
    "PLAN_ROUTE_DSGNTN_AUTH = 'BLM'",
    "PLAN_OHV_ROUTE_DSGNTN in ('Open','OPEN','Limited','LIMITED')",
  ];
  if (adminStates.length > 0) {
    clauses.push(`ADMIN_ST in (${adminStates.map(sqlString).join(',')})`);
  }
  const minMiles = Math.max(0, Number(options.minMiles ?? 1));
  if (minMiles > 0) clauses.push(`GIS_MILES >= ${minMiles}`);
  return clauses.join(' and ');
}

export function normalizeBlmGtlfFeatureCollection(payload: unknown): BlmGtlfArcGisFeature[] {
  const record = payload && typeof payload === 'object' ? payload as { features?: unknown } : {};
  if (!Array.isArray(record.features)) return [];
  return record.features
    .filter((feature): feature is Record<string, unknown> => !!feature && typeof feature === 'object')
    .map((feature) => ({
      attributes: feature.attributes && typeof feature.attributes === 'object'
        ? feature.attributes as Record<string, unknown>
        : {},
      geometry: feature.geometry && typeof feature.geometry === 'object'
        ? feature.geometry as BlmGtlfArcGisFeature['geometry']
        : undefined,
    }));
}

export function arcGisFeatureToBlmGtlfRouteUpsert(
  feature: BlmGtlfArcGisFeature,
  context: BlmGtlfRouteContext,
) {
  const attributes = feature.attributes ?? {};
  const distanceMiles = cleanNumber(attributes.GIS_MILES ?? attributes.BLM_MILES);
  const minMiles = Math.max(0, Number(context.minMiles ?? 1));
  if (distanceMiles == null || distanceMiles < minMiles) return null;
  if (!isPublicMotorizedFeature(attributes)) return null;

  const paths = normalizePaths(feature);
  const routeGeometry = routeGeometryFromPaths(paths);
  const center = centerFromPaths(paths);
  if (!routeGeometry || !center) return null;

  const vehicleFit = vehicleFitFromAttributes(context.layer, attributes);
  if (vehicleFit.length === 0) return null;

  const publicId = publicIdForFeature(context.layer, attributes);
  const name = routeName(context.layer, attributes);
  const providerId = providerFeatureId(context.layer, attributes);
  const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 16));
  const isLimited = /^limited$/i.test(cleanString(attributes.PLAN_OHV_ROUTE_DSGNTN)) || context.layer.motorizedUse === 'limited';
  const seasonalRestrictionCount =
    isLimited ||
    cleanString(attributes.PLAN_SEASON_RSTRCT_CODE) ||
    /season/i.test(cleanString(attributes.OHV_ROUTE_DSGNTN_LIM))
      ? 1
      : 0;
  const limitation = limitationWarning(attributes);

  const verifiedRoute = {
    public_id: publicId,
    name,
    description: `${context.layer.sourceLayer} official BLM GTLF source segment. ECS stores this as source-backed geometry for curation, not as a finished expedition route recommendation.`,
    route_type: 'point_to_point',
    center_latitude: center.latitude,
    center_longitude: center.longitude,
    route_geometry: routeGeometry,
    distance_miles: Number(distanceMiles.toFixed(3)),
    estimated_duration_minutes: estimatedDurationMinutes,
    difficulty: 'unknown',
    vehicle_fit: vehicleFit,
    remoteness_score: estimateBlmRemotenessScore(distanceMiles),
    campability_score: null,
    minimum_fuel_range_miles: estimateMinimumFuelRangeMiles(distanceMiles),
    minimum_water_capacity_gallons: estimateMinimumWaterCapacityGallons(estimatedDurationMinutes),
    route_intelligence: blmGtlfRouteIntelligence({
      layer: context.layer,
      distanceMiles,
      estimatedDurationMinutes,
    }),
    official_access_coverage_pct: isLimited ? 75 : 85,
    unknown_access_coverage_pct: isLimited ? 25 : 15,
    restricted_access_coverage_pct: 0,
    active_closure_count: 0,
    seasonal_restriction_count: seasonalRestrictionCount,
    vehicle_mismatch: false,
    geometry_quality: 'good',
    verification_status: 'partially_verified',
    recommendation_status: 'not_recommended',
    review_status: 'approved',
    confidence_score: isLimited ? 78 : 84,
    confidence_reasons: [
      `BLM GTLF lists this ${context.layer.kind} in a public motorized-use layer.`,
      `BLM designation authority: ${cleanString(attributes.PLAN_ROUTE_DSGNTN_AUTH) || 'unknown'}.`,
    ],
    warning_reasons: [
      BLM_GTLF_CAVEAT,
      'BLM GTLF source segment awaits ECS route curation before public recommendation.',
      ...(limitation ? [limitation] : []),
    ],
    blocker_reasons: ['BLM GTLF source segment is not yet curated into an ECS route recommendation.'],
    closure_summaries: [],
    community_signal: {
      sourceAdapter: 'blm_gtlf',
      sourceLayerId: context.layer.id,
      sourceLayerName: context.layer.name,
      routePlanId: routePlanId(attributes) || null,
      providerFeatureId: providerId,
    },
    tags: uniqueStrings([
      'BLM GTLF',
      cleanString(attributes.ADMIN_ST),
      context.layer.kind,
      context.layer.motorizedUse === 'limited' ? 'limited motorized use' : 'public motorized use',
      cleanString(attributes.PLAN_ASSET_CLASS),
      cleanString(attributes.OBSRVE_SRFCE_TYPE),
    ]),
    last_verified_at: context.sourceLastVerifiedAt,
    stale_at: addDaysIso(context.sourceLastVerifiedAt, 180),
  };

  const rawSourceFeature = {
    route_source_id: context.sourceId,
    ingest_run_id: context.ingestRunId ?? null,
    provider_feature_id: providerId,
    source_layer: context.layer.sourceLayer,
    source_uri: context.layer.url,
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
    source_role: 'primary',
    coverage_pct: isLimited ? 75 : 85,
    last_verified_at: context.sourceLastVerifiedAt,
    metadata: {
      providerFeatureId: providerId,
      sourceLayer: context.layer.sourceLayer,
      sourceLayerId: context.layer.id,
      adminState: cleanString(attributes.ADMIN_ST),
      routePlanId: routePlanId(attributes) || null,
      ohvDesignation: cleanString(attributes.PLAN_OHV_ROUTE_DSGNTN),
      limitation: cleanString(attributes.OHV_ROUTE_DSGNTN_LIM) || null,
      caveat: BLM_GTLF_CAVEAT,
    },
  };

  return {
    verifiedRoute,
    verifiedRouteSource,
    rawSourceFeature,
  };
}

export function aggregateBlmGtlfRouteFeatures(
  features: BlmGtlfArcGisFeature[],
  context: BlmGtlfRouteContext,
): BlmGtlfAggregateRouteUpsert[] {
  const groups = new Map<string, {
    identity: NonNullable<ReturnType<typeof aggregationIdentity>>;
    segments: BlmGtlfRouteUpsert[];
  }>();

  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    const identity = aggregationIdentity(context.layer, attributes);
    if (!identity) continue;

    const segment = arcGisFeatureToBlmGtlfRouteUpsert(feature, context);
    if (!segment || !isRecommendableBlmAggregateSegment(context.layer, segment)) continue;

    const key = `${context.layer.id}:${identity.key}`;
    const existing = groups.get(key);
    if (existing) {
      existing.segments.push(segment);
    } else {
      groups.set(key, { identity, segments: [segment] });
    }
  }

  return Array.from(groups.values()).map(({ identity, segments }) => {
    const segmentPublicIds = segments.map((segment) => String(segment.verifiedRoute.public_id));
    const segmentProviderFeatureIds = segments.map((segment) => String(segment.rawSourceFeature.provider_feature_id));
    const lines = segments.flatMap((segment) =>
      lineStringsFromRouteGeometry(segment.verifiedRoute.route_geometry as Record<string, unknown>),
    );
    const center = centerFromPaths(lines);
    const sourceFeatureCount = segments.length;
    const distanceMiles = Number(segments.reduce((total, segment) => total + Number(segment.verifiedRoute.distance_miles ?? 0), 0).toFixed(3));
    const estimatedDurationMinutes = Math.max(20, Math.round(distanceMiles * 16));
    const vehicleFit = orderedVehicleFit(segments.flatMap((segment) =>
      Array.isArray(segment.verifiedRoute.vehicle_fit) ? segment.verifiedRoute.vehicle_fit.map(String) : [],
    ));
    const firstAttributes = sourceAttributes(segments[0]);
    const aggregationKind = identity.aggregation;
    const aggregationLabel = aggregationKind === 'blm_gtlf_route_identity' ? 'route identity' : 'source feature';
    const districtTags = uniqueStrings(segments.flatMap((segment) =>
      Array.isArray(segment.verifiedRoute.tags) ? segment.verifiedRoute.tags.map(String) : [],
    ).filter((tag) => tag !== 'BLM GTLF' && tag !== context.layer.kind && tag !== 'public motorized use'));
    const routeGeometry = lines.length === 1
      ? { type: 'LineString', coordinates: lines[0] }
      : { type: 'MultiLineString', coordinates: lines };
    const publicId = slugify(identity.publicIdParts.join(' '));

    return {
      verifiedRoute: {
        public_id: publicId,
        name: routeName(context.layer, firstAttributes),
        description: `${context.layer.sourceLayer} ${aggregationLabel} aggregate built from ${sourceFeatureCount} official BLM GTLF source segment${sourceFeatureCount === 1 ? '' : 's'}. ECS treats this as official public motorized-access geometry that still requires current local checks.`,
        route_type: 'point_to_point',
        center_latitude: center?.latitude ?? Number(segments[0].verifiedRoute.center_latitude),
        center_longitude: center?.longitude ?? Number(segments[0].verifiedRoute.center_longitude),
        route_geometry: routeGeometry,
        distance_miles: distanceMiles,
        estimated_duration_minutes: estimatedDurationMinutes,
        difficulty: 'unknown',
        vehicle_fit: vehicleFit,
        remoteness_score: estimateBlmRemotenessScore(distanceMiles),
        campability_score: null,
        minimum_fuel_range_miles: estimateMinimumFuelRangeMiles(distanceMiles),
        minimum_water_capacity_gallons: estimateMinimumWaterCapacityGallons(estimatedDurationMinutes),
        route_intelligence: {
          ...blmGtlfRouteIntelligence({
            layer: context.layer,
            distanceMiles,
            estimatedDurationMinutes,
          }),
          sourceFeatureCount,
          aggregation: aggregationKind,
        },
        official_access_coverage_pct: 90,
        unknown_access_coverage_pct: 10,
        restricted_access_coverage_pct: 0,
        active_closure_count: 0,
        seasonal_restriction_count: 0,
        vehicle_mismatch: false,
        geometry_quality: sourceFeatureCount > 1 ? 'partial' : 'good',
        verification_status: 'official_verified',
        recommendation_status: 'recommendable',
        review_status: 'approved',
        confidence_score: sourceFeatureCount > 1 ? 86 : 84,
        confidence_reasons: [
          `BLM GTLF lists this ${context.layer.kind} ${aggregationLabel} in a public motorized-use layer.`,
          aggregationKind === 'blm_gtlf_route_identity'
            ? `Combined ${sourceFeatureCount} BLM GTLF source segment${sourceFeatureCount === 1 ? '' : 's'} with matching route identity.`
            : 'Promoted a single official BLM GTLF source feature because the feed lacks a route plan/name identity.',
          'All aggregated source segments are open public motorized records without encoded seasonal or limitation text.',
        ],
        warning_reasons: [
          BLM_GTLF_CAVEAT,
          'BLM GTLF public recommendation is source-backed, but ECS has not ingested local closure orders for this BLM unit yet.',
        ],
        blocker_reasons: [],
        closure_summaries: [],
        community_signal: {
          aggregation: aggregationKind,
          sourceFeatureCount,
          segmentPublicIds,
          providerFeatureIds: segmentProviderFeatureIds,
          routePlanId: identity.planId || null,
        },
        tags: uniqueStrings([
          'BLM GTLF',
          identity.adminState.toUpperCase(),
          context.layer.kind,
          'public motorized use',
          'source-segment aggregate',
          ...districtTags,
        ]),
        last_verified_at: context.sourceLastVerifiedAt,
        stale_at: addDaysIso(context.sourceLastVerifiedAt, 120),
      },
      verifiedRouteSource: {
        route_source_id: context.sourceId,
        source_role: 'primary',
        coverage_pct: 90,
        last_verified_at: context.sourceLastVerifiedAt,
        metadata: {
          providerFeatureIds: segmentProviderFeatureIds,
          segmentPublicIds,
          sourceFeatureCount,
          sourceLayer: context.layer.sourceLayer,
          sourceLayerId: context.layer.id,
          adminState: identity.adminState.toUpperCase(),
          routePlanId: identity.planId || null,
          aggregation: aggregationKind,
          caveat: BLM_GTLF_CAVEAT,
        },
      },
      segmentPublicIds,
      segmentProviderFeatureIds,
    };
  });
}

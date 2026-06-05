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

export type BlmGtlfClosureStatus = 'active' | 'scheduled' | 'expired' | 'unknown';
export type BlmGtlfClosureType =
  | 'seasonal'
  | 'emergency'
  | 'fire'
  | 'flood'
  | 'maintenance'
  | 'land_manager'
  | 'permanent'
  | 'unknown';

export type BlmGtlfAdvisoryStatus = 'active' | 'scheduled' | 'expired' | 'unknown';
export type BlmGtlfAdvisoryType =
  | 'fire_restriction'
  | 'road_delay'
  | 'construction'
  | 'water_unavailable'
  | 'resource_restriction'
  | 'land_manager_notice'
  | 'unknown';

export type BlmGtlfCurrentConditionClosure = {
  id?: string;
  title: string;
  summary?: string;
  sourceUrl?: string;
  orderNumber?: string;
  status: BlmGtlfClosureStatus;
  closureType: BlmGtlfClosureType;
  startsAt?: string | null;
  endsAt?: string | null;
  lastVerifiedAt?: string;
  confidenceScore?: number;
  adminStates: string[];
  routePublicIds: string[];
  segmentPublicIds: string[];
  providerFeatureIds: string[];
  routePlanIds: string[];
  routeNames: string[];
  routeIdentityPatterns: string[];
};

export type BlmGtlfCurrentConditionAdvisory = {
  id?: string;
  title: string;
  summary?: string;
  sourceUrl?: string;
  orderNumber?: string;
  status: BlmGtlfAdvisoryStatus;
  advisoryType: BlmGtlfAdvisoryType;
  startsAt?: string | null;
  endsAt?: string | null;
  lastVerifiedAt?: string;
  confidenceScore?: number;
  adminStates: string[];
  routePublicIds: string[];
  segmentPublicIds: string[];
  providerFeatureIds: string[];
  routePlanIds: string[];
  routeNames: string[];
  routeIdentityPatterns: string[];
};

export type BlmGtlfCurrentConditionSource = {
  adminState: string;
  providerId: string;
  label: string;
  sourceUrl: string;
  referenceUrl: string;
  checkedAt: string;
  staleAt: string;
  closures: BlmGtlfCurrentConditionClosure[];
  advisories: BlmGtlfCurrentConditionAdvisory[];
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
const BLM_GTLF_CURRENT_CONDITIONS_URI = 'https://www.blm.gov/alerts';

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

function hasSeasonalRestrictionCode(attributes: Record<string, unknown>): boolean {
  const code = cleanString(attributes.PLAN_SEASON_RSTRCT_CODE).toUpperCase();
  if (!code || code === 'NO' || code === 'NONE' || code === 'N/A') return false;
  return true;
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
  if (hasSeasonalRestrictionCode(attributes)) return false;
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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readStringList(record: Record<string, unknown>, keys: string[]): string[] {
  return uniqueStrings(keys.flatMap((key) => {
    const value = record[key];
    if (Array.isArray(value)) return value.map((item) => cleanString(item));
    return [cleanString(value)];
  }));
}

function normalizeIsoString(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

const BLM_GTLF_STATE_ALIASES: Record<string, string> = {
  ak: 'AK',
  alaska: 'AK',
  az: 'AZ',
  arizona: 'AZ',
  ca: 'CA',
  california: 'CA',
  co: 'CO',
  colorado: 'CO',
  id: 'ID',
  idaho: 'ID',
  mt: 'MT',
  montana: 'MT',
  nv: 'NV',
  nevada: 'NV',
  nm: 'NM',
  'new mexico': 'NM',
  newmexico: 'NM',
  ut: 'UT',
  utah: 'UT',
  wy: 'WY',
  wyoming: 'WY',
};

function normalizeBlmAdminState(value: unknown): string {
  const raw = cleanString(value);
  if (!raw) return '';
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/^[a-z]{2}$/i.test(raw) && BLM_GTLF_STATE_ALIASES[raw.toLowerCase()]) return raw.toUpperCase();
  if (BLM_GTLF_STATE_ALIASES[compact]) return BLM_GTLF_STATE_ALIASES[compact];
  if (BLM_GTLF_STATE_ALIASES[compact.replace(/\s+/g, '')]) return BLM_GTLF_STATE_ALIASES[compact.replace(/\s+/g, '')];
  const providerIdState = raw.toLowerCase().match(/^blm_current_conditions_([a-z]{2})$/);
  if (providerIdState && BLM_GTLF_STATE_ALIASES[providerIdState[1]]) {
    return BLM_GTLF_STATE_ALIASES[providerIdState[1]];
  }
  return '';
}

function normalizeBlmAdminStates(values: unknown[]): string[] {
  return uniqueStrings(values.map(normalizeBlmAdminState).filter(Boolean));
}

function normalizeClosureStatus(value: unknown): BlmGtlfClosureStatus {
  const text = cleanString(value).toLowerCase();
  if (text === 'active' || text === 'closed' || text === 'open_closure' || text === 'in_effect') return 'active';
  if (text === 'scheduled' || text === 'planned' || text === 'pending') return 'scheduled';
  if (text === 'expired' || text === 'ended' || text === 'inactive' || text === 'rescinded') return 'expired';
  return 'unknown';
}

function normalizeClosureType(value: unknown): BlmGtlfClosureType {
  const text = cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (
    text === 'seasonal' ||
    text === 'emergency' ||
    text === 'fire' ||
    text === 'flood' ||
    text === 'maintenance' ||
    text === 'land_manager' ||
    text === 'permanent' ||
    text === 'unknown'
  ) {
    return text as BlmGtlfClosureType;
  }
  if (text === 'closure_order' || text === 'official_order' || text === 'administrative' || text === 'travel_management') {
    return 'land_manager';
  }
  return 'unknown';
}

function normalizeAdvisoryStatus(value: unknown): BlmGtlfAdvisoryStatus {
  return normalizeClosureStatus(value);
}

function normalizeAdvisoryType(value: unknown): BlmGtlfAdvisoryType {
  const text = cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (
    text === 'fire_restriction' ||
    text === 'road_delay' ||
    text === 'construction' ||
    text === 'water_unavailable' ||
    text === 'resource_restriction' ||
    text === 'land_manager_notice' ||
    text === 'unknown'
  ) {
    return text as BlmGtlfAdvisoryType;
  }
  if (text === 'fire_prevention_order' || text === 'fire_order' || text === 'stage_1' || text === 'stage_2') {
    return 'fire_restriction';
  }
  if (text === 'water' || text === 'no_water' || text === 'water_outage') return 'water_unavailable';
  if (text === 'delay' || text === 'roadwork' || text === 'road_work') return 'road_delay';
  if (text === 'paleontology' || text === 'resource_use' || text === 'resource_prohibition') return 'resource_restriction';
  if (text === 'notice' || text === 'advisory') return 'land_manager_notice';
  return 'unknown';
}

function currentConditionInputs(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map(readRecord).filter((record): record is Record<string, unknown> => !!record);
  }
  const record = readRecord(value);
  if (!record) return [];
  if (
    Array.isArray(record.closures) ||
    Array.isArray(record.advisories) ||
    cleanString(record.adminState) ||
    cleanString(record.admin_state) ||
    cleanString(record.state) ||
    cleanString(record.providerId) ||
    cleanString(record.provider_id)
  ) {
    return [record];
  }
  return Object.entries(record)
    .map(([adminState, sourceValue]) => {
      const sourceRecord = readRecord(sourceValue);
      return sourceRecord ? { adminState, ...sourceRecord } : null;
    })
    .filter((sourceRecord): sourceRecord is Record<string, unknown> => !!sourceRecord);
}

function sourceAdminState(record: Record<string, unknown>, selectedStates: string[]): string {
  const requested = [
    record.adminState,
    record.admin_state,
    record.state,
    record.providerId,
    record.provider_id,
  ].map(normalizeBlmAdminState).filter(Boolean);
  if (requested.length > 0) {
    const selectedSet = new Set(selectedStates);
    return requested.find((state) => selectedSet.size === 0 || selectedSet.has(state)) ?? '';
  }
  return selectedStates.length === 1 ? selectedStates[0] : '';
}

function normalizeCurrentConditionClosure(
  value: unknown,
  source: Pick<BlmGtlfCurrentConditionSource, 'adminState' | 'sourceUrl' | 'checkedAt'>,
): BlmGtlfCurrentConditionClosure | null {
  const record = readRecord(value);
  if (!record) return null;
  const title = cleanString(record.title ?? record.name ?? record.orderNumber ?? record.order_number);
  if (!title) return null;
  const adminStates = normalizeBlmAdminStates([
    ...readStringList(record, ['adminState', 'admin_state', 'adminStates', 'admin_states', 'state', 'states']),
    source.adminState,
  ]);

  return {
    id: cleanString(record.id ?? record.providerClosureId ?? record.provider_closure_id) || undefined,
    title,
    summary: cleanString(record.summary ?? record.description ?? record.notice) || undefined,
    sourceUrl: cleanString(record.sourceUrl ?? record.source_url) || source.sourceUrl,
    orderNumber: cleanString(record.orderNumber ?? record.order_number ?? record.closureOrder ?? record.closure_order) || undefined,
    status: normalizeClosureStatus(record.status),
    closureType: normalizeClosureType(record.closureType ?? record.closure_type ?? record.type),
    startsAt: normalizeIsoString(record.startsAt ?? record.starts_at ?? record.startDate ?? record.start_date),
    endsAt: normalizeIsoString(record.endsAt ?? record.ends_at ?? record.endDate ?? record.end_date),
    lastVerifiedAt: normalizeIsoString(record.lastVerifiedAt ?? record.last_verified_at) ?? source.checkedAt,
    confidenceScore: clampNumber(Number(record.confidenceScore ?? record.confidence_score ?? 90), 0, 100),
    adminStates,
    routePublicIds: readStringList(record, ['routePublicId', 'route_public_id', 'routePublicIds', 'route_public_ids']),
    segmentPublicIds: readStringList(record, ['segmentPublicId', 'segment_public_id', 'segmentPublicIds', 'segment_public_ids']),
    providerFeatureIds: readStringList(record, ['providerFeatureId', 'provider_feature_id', 'providerFeatureIds', 'provider_feature_ids']),
    routePlanIds: readStringList(record, [
      'routePlanId',
      'route_plan_id',
      'routePlanIds',
      'route_plan_ids',
      'routeId',
      'route_id',
      'routeIds',
      'route_ids',
      'routeNumber',
      'route_number',
    ]),
    routeNames: readStringList(record, ['routeName', 'route_name', 'routeNames', 'route_names']),
    routeIdentityPatterns: readStringList(record, [
      'routeIdentity',
      'route_identity',
      'routeNamePattern',
      'route_name_pattern',
      'routeNameIncludes',
      'route_name_includes',
      'routeIdentityPatterns',
      'route_identity_patterns',
    ]),
  };
}

function normalizeCurrentConditionAdvisory(
  value: unknown,
  source: Pick<BlmGtlfCurrentConditionSource, 'adminState' | 'sourceUrl' | 'checkedAt'>,
): BlmGtlfCurrentConditionAdvisory | null {
  const record = readRecord(value);
  if (!record) return null;
  const title = cleanString(record.title ?? record.name ?? record.orderNumber ?? record.order_number);
  if (!title) return null;
  const adminStates = normalizeBlmAdminStates([
    ...readStringList(record, ['adminState', 'admin_state', 'adminStates', 'admin_states', 'state', 'states']),
    source.adminState,
  ]);

  return {
    id: cleanString(record.id ?? record.providerAdvisoryId ?? record.provider_advisory_id) || undefined,
    title,
    summary: cleanString(record.summary ?? record.description ?? record.notice) || undefined,
    sourceUrl: cleanString(record.sourceUrl ?? record.source_url) || source.sourceUrl,
    orderNumber: cleanString(record.orderNumber ?? record.order_number ?? record.fireOrder ?? record.fire_order) || undefined,
    status: normalizeAdvisoryStatus(record.status),
    advisoryType: normalizeAdvisoryType(record.advisoryType ?? record.advisory_type ?? record.type),
    startsAt: normalizeIsoString(record.startsAt ?? record.starts_at ?? record.startDate ?? record.start_date),
    endsAt: normalizeIsoString(record.endsAt ?? record.ends_at ?? record.endDate ?? record.end_date),
    lastVerifiedAt: normalizeIsoString(record.lastVerifiedAt ?? record.last_verified_at) ?? source.checkedAt,
    confidenceScore: clampNumber(Number(record.confidenceScore ?? record.confidence_score ?? 88), 0, 100),
    adminStates,
    routePublicIds: readStringList(record, ['routePublicId', 'route_public_id', 'routePublicIds', 'route_public_ids']),
    segmentPublicIds: readStringList(record, ['segmentPublicId', 'segment_public_id', 'segmentPublicIds', 'segment_public_ids']),
    providerFeatureIds: readStringList(record, ['providerFeatureId', 'provider_feature_id', 'providerFeatureIds', 'provider_feature_ids']),
    routePlanIds: readStringList(record, [
      'routePlanId',
      'route_plan_id',
      'routePlanIds',
      'route_plan_ids',
      'routeId',
      'route_id',
      'routeIds',
      'route_ids',
      'routeNumber',
      'route_number',
    ]),
    routeNames: readStringList(record, ['routeName', 'route_name', 'routeNames', 'route_names']),
    routeIdentityPatterns: readStringList(record, [
      'routeIdentity',
      'route_identity',
      'routeName',
      'route_name',
      'routeNamePattern',
      'route_name_pattern',
      'routeNameIncludes',
      'route_name_includes',
      'routeIdentityPatterns',
      'route_identity_patterns',
    ]),
  };
}

export function normalizeBlmGtlfCurrentConditionSources(
  value: unknown,
  states: string[] = [],
  nowIso = new Date().toISOString(),
): BlmGtlfCurrentConditionSource[] {
  const selectedStates = normalizeBlmAdminStates(states);
  return currentConditionInputs(value)
    .map((record) => {
      const adminState = sourceAdminState(record, selectedStates);
      if (!adminState) return null;
      const checkedAt = normalizeIsoString(record.checkedAt ?? record.checked_at ?? record.lastCheckedAt ?? record.last_checked_at) ?? nowIso;
      const source: BlmGtlfCurrentConditionSource = {
        adminState,
        providerId: cleanString(record.providerId ?? record.provider_id) || `blm_current_conditions_${adminState.toLowerCase()}`,
        label: cleanString(record.label ?? record.name) || `BLM ${adminState} alerts and current travel information`,
        sourceUrl: cleanString(record.sourceUrl ?? record.source_url) || BLM_GTLF_CURRENT_CONDITIONS_URI,
        referenceUrl: cleanString(record.referenceUrl ?? record.reference_url) ||
          cleanString(record.sourceUrl ?? record.source_url) ||
          BLM_GTLF_CURRENT_CONDITIONS_URI,
        checkedAt,
        staleAt: normalizeIsoString(record.staleAt ?? record.stale_at) ?? addDaysIso(checkedAt, 7),
        closures: [],
        advisories: [],
      };
      const closures = Array.isArray(record.closures) ? record.closures : [];
      source.closures = closures
        .map((closure) => normalizeCurrentConditionClosure(closure, source))
        .filter((closure): closure is BlmGtlfCurrentConditionClosure => !!closure);
      const advisories = Array.isArray(record.advisories) ? record.advisories : [];
      source.advisories = advisories
        .map((advisory) => normalizeCurrentConditionAdvisory(advisory, source))
        .filter((advisory): advisory is BlmGtlfCurrentConditionAdvisory => !!advisory);
      return source;
    })
    .filter((source): source is BlmGtlfCurrentConditionSource => !!source);
}

export function routeCurrentConditionSourceUpsertForBlmGtlf(source: BlmGtlfCurrentConditionSource) {
  return {
    provider_id: source.providerId,
    name: source.label,
    source_type: 'federal_agency',
    authority: 'official_closure',
    source_uri: source.sourceUrl,
    attribution: 'Bureau of Land Management closure orders, alerts, and current travel information',
    license: 'agency published terms',
    refresh_frequency: 'current condition review before recommendation sync',
    status: 'active',
    last_checked_at: source.checkedAt,
  };
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function metadataValues(value: unknown, keys: string[]): string[] {
  const record = readRecord(value);
  if (!record) return [];
  return readStringList(record, keys);
}

function routePlanAliases(routePlanId: string): string[] {
  const cleanRoutePlanId = cleanString(routePlanId);
  return uniqueStrings([
    cleanRoutePlanId,
    cleanRoutePlanId ? `route ${cleanRoutePlanId}` : '',
    cleanRoutePlanId ? `road ${cleanRoutePlanId}` : '',
    cleanRoutePlanId ? `blm road ${cleanRoutePlanId}` : '',
    cleanRoutePlanId ? `blm trail ${cleanRoutePlanId}` : '',
  ]);
}

function routeAdminStates(target: BlmGtlfRouteUpsert | BlmGtlfAggregateRouteUpsert): string[] {
  const route = target.verifiedRoute;
  const sourceMetadata = readRecord(target.verifiedRouteSource.metadata);
  const communitySignal = readRecord(route.community_signal);
  return normalizeBlmAdminStates([
    ...(Array.isArray(route.tags) ? route.tags.map((tag) => cleanString(tag)) : []),
    ...metadataValues(sourceMetadata, ['adminState', 'admin_state', 'states']),
    ...metadataValues(communitySignal, ['adminState', 'admin_state', 'states']),
  ]);
}

function routeMatchValues(target: BlmGtlfRouteUpsert | BlmGtlfAggregateRouteUpsert): string[] {
  const route = target.verifiedRoute;
  const sourceMetadata = readRecord(target.verifiedRouteSource.metadata);
  const communitySignal = readRecord(route.community_signal);
  return uniqueStrings([
    cleanString(route.public_id),
    cleanString(route.name),
    ...(Array.isArray(route.tags) ? route.tags.map((tag) => cleanString(tag)) : []),
    ...(Array.isArray(target.segmentPublicIds) ? target.segmentPublicIds.map((id) => cleanString(id)) : []),
    ...(Array.isArray(target.segmentProviderFeatureIds) ? target.segmentProviderFeatureIds.map((id) => cleanString(id)) : []),
    ...metadataValues(sourceMetadata, [
      'providerFeatureId',
      'providerFeatureIds',
      'segmentPublicId',
      'segmentPublicIds',
      'routePlanId',
      'route_plan_id',
      'sourceLayer',
    ]),
    ...metadataValues(communitySignal, [
      'providerFeatureId',
      'providerFeatureIds',
      'segmentPublicId',
      'segmentPublicIds',
      'routePlanId',
      'route_plan_id',
    ]),
  ]);
}

function anyExactMatch(candidates: string[], needles: string[]): boolean {
  const candidateSet = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  return needles.some((needle) => candidateSet.has(needle.toLowerCase()));
}

function anyTextMatch(candidates: string[], needles: string[]): boolean {
  const normalizedCandidates = candidates.map(normalizedText).filter(Boolean);
  return needles.some((needle) => {
    const normalizedNeedle = normalizedText(needle);
    if (normalizedNeedle.length < 2) return false;
    const slugNeedle = slugify(needle).replace(/-/g, ' ');
    return normalizedCandidates.some((candidate) =>
      candidate === normalizedNeedle ||
      candidate.includes(normalizedNeedle) ||
      (slugNeedle.length >= 2 && candidate.includes(slugNeedle)),
    );
  });
}

function closureMatchesRoute(
  closure: BlmGtlfCurrentConditionClosure,
  target: BlmGtlfRouteUpsert | BlmGtlfAggregateRouteUpsert,
): boolean {
  const closureStates = normalizeBlmAdminStates(closure.adminStates);
  const targetStates = routeAdminStates(target);
  if (closureStates.length > 0) {
    if (targetStates.length === 0) return false;
    if (!closureStates.some((state) => targetStates.includes(state))) return false;
  }

  const candidates = routeMatchValues(target);
  if (anyExactMatch(candidates, closure.routePublicIds)) return true;
  if (anyExactMatch(candidates, closure.segmentPublicIds)) return true;
  if (anyExactMatch(candidates, closure.providerFeatureIds)) return true;
  if (anyExactMatch(candidates, closure.routePlanIds)) return true;
  if (anyTextMatch(candidates, closure.routeNames)) return true;
  if (anyTextMatch(candidates, closure.routeIdentityPatterns)) return true;
  return closure.routePlanIds.some((routePlanId) => anyTextMatch(candidates, routePlanAliases(routePlanId)));
}

function advisoryHasRouteScope(advisory: BlmGtlfCurrentConditionAdvisory): boolean {
  return advisory.routePublicIds.length > 0 ||
    advisory.segmentPublicIds.length > 0 ||
    advisory.providerFeatureIds.length > 0 ||
    advisory.routePlanIds.length > 0 ||
    advisory.routeNames.length > 0 ||
    advisory.routeIdentityPatterns.length > 0;
}

function advisoryMatchesRoute(
  advisory: BlmGtlfCurrentConditionAdvisory,
  target: BlmGtlfRouteUpsert | BlmGtlfAggregateRouteUpsert,
): boolean {
  const advisoryStates = normalizeBlmAdminStates(advisory.adminStates);
  const targetStates = routeAdminStates(target);
  if (advisoryStates.length > 0) {
    if (targetStates.length === 0) return false;
    if (!advisoryStates.some((state) => targetStates.includes(state))) return false;
  }

  if (!advisoryHasRouteScope(advisory)) return true;

  const candidates = routeMatchValues(target);
  if (anyExactMatch(candidates, advisory.routePublicIds)) return true;
  if (anyExactMatch(candidates, advisory.segmentPublicIds)) return true;
  if (anyExactMatch(candidates, advisory.providerFeatureIds)) return true;
  if (anyExactMatch(candidates, advisory.routePlanIds)) return true;
  if (anyTextMatch(candidates, advisory.routeNames)) return true;
  if (anyTextMatch(candidates, advisory.routeIdentityPatterns)) return true;
  return advisory.routePlanIds.some((routePlanId) => anyTextMatch(candidates, routePlanAliases(routePlanId)));
}

function closureIsActive(closure: BlmGtlfCurrentConditionClosure, checkedAt: string): boolean {
  if (closure.status !== 'active') return false;
  const checkedTime = Date.parse(checkedAt);
  const endTime = closure.endsAt ? Date.parse(closure.endsAt) : Number.NaN;
  return !(Number.isFinite(checkedTime) && Number.isFinite(endTime) && endTime < checkedTime);
}

function advisoryIsActive(advisory: BlmGtlfCurrentConditionAdvisory, checkedAt: string): boolean {
  if (advisory.status !== 'active') return false;
  const checkedTime = Date.parse(checkedAt);
  const endTime = advisory.endsAt ? Date.parse(advisory.endsAt) : Number.NaN;
  return !(Number.isFinite(checkedTime) && Number.isFinite(endTime) && endTime < checkedTime);
}

function closureSummary(source: BlmGtlfCurrentConditionSource, closure: BlmGtlfCurrentConditionClosure): string {
  return [
    closure.title,
    closure.summary,
    closure.orderNumber ? `BLM Order ${closure.orderNumber}` : '',
    source.label,
    closure.sourceUrl,
  ].filter(Boolean).join(' | ');
}

function advisorySummary(source: BlmGtlfCurrentConditionSource, advisory: BlmGtlfCurrentConditionAdvisory): string {
  return [
    advisory.title,
    advisory.summary,
    advisory.orderNumber ? `BLM Order ${advisory.orderNumber}` : '',
    source.label,
    advisory.sourceUrl,
  ].filter(Boolean).join(' | ');
}

export function applyBlmGtlfCurrentConditionSources<T extends BlmGtlfRouteUpsert | BlmGtlfAggregateRouteUpsert>(
  target: T,
  sources: BlmGtlfCurrentConditionSource[] = [],
): T {
  const targetStates = routeAdminStates(target);
  const relevantSources = sources.filter((source) => targetStates.includes(source.adminState));
  if (relevantSources.length === 0) return target;

  const matched = relevantSources.flatMap((source) =>
    source.closures
      .filter((closure) => closureMatchesRoute(closure, target))
      .map((closure) => ({ source, closure })),
  );
  const matchedAdvisories = relevantSources.flatMap((source) =>
    source.advisories
      .filter((advisory) => advisoryMatchesRoute(advisory, target))
      .map((advisory) => ({ source, advisory })),
  );
  const activeMatches = matched.filter(({ source, closure }) => closureIsActive(closure, source.checkedAt));
  const watchMatches = matched.filter(({ source, closure }) => !closureIsActive(closure, source.checkedAt));
  const activeAdvisories = matchedAdvisories.filter(({ source, advisory }) => advisoryIsActive(advisory, source.checkedAt));
  const watchAdvisories = matchedAdvisories.filter(({ source, advisory }) => !advisoryIsActive(advisory, source.checkedAt));
  const existingActiveClosureCount = Number(target.verifiedRoute.active_closure_count ?? 0);
  const conditionSummary = {
    sourceCount: relevantSources.length,
    matchedClosureCount: matched.length,
    activeClosureCount: activeMatches.length,
    watchClosureCount: watchMatches.length,
    matchedAdvisoryCount: matchedAdvisories.length,
    activeAdvisoryCount: activeAdvisories.length,
    watchAdvisoryCount: watchAdvisories.length,
    advisorySummaries: uniqueStrings(matchedAdvisories.map(({ source, advisory }) => advisorySummary(source, advisory))),
    checkedAt: uniqueStrings(relevantSources.map((source) => source.checkedAt)),
    staleAt: uniqueStrings(relevantSources.map((source) => source.staleAt)),
    caveat: BLM_GTLF_CAVEAT,
  };
  const existingCommunitySignal = readRecord(target.verifiedRoute.community_signal) ?? {};
  const existingMetadata = readRecord(target.verifiedRouteSource.metadata) ?? {};
  const baseWarnings = Array.isArray(target.verifiedRoute.warning_reasons)
    ? target.verifiedRoute.warning_reasons
      .map((warning) => cleanString(warning))
      .filter((warning) => !/has not ingested local closure orders/i.test(warning))
    : [];
  const baseBlockers = Array.isArray(target.verifiedRoute.blocker_reasons)
    ? target.verifiedRoute.blocker_reasons.map((blocker) => cleanString(blocker))
    : [];
  const baseClosures = Array.isArray(target.verifiedRoute.closure_summaries)
    ? target.verifiedRoute.closure_summaries.map((summary) => cleanString(summary))
    : [];

  const verifiedRoute = {
    ...target.verifiedRoute,
    active_closure_count: existingActiveClosureCount + activeMatches.length,
    warning_reasons: uniqueStrings([
      ...baseWarnings,
      ...relevantSources.map((source) => `Official BLM current-condition source checked: ${source.label} at ${source.checkedAt}.`),
      ...watchMatches.map(({ closure }) => `Official BLM current-condition notice requires review: ${closure.title}.`),
      ...activeAdvisories.map(({ advisory }) => `Active official BLM advisory: ${advisory.title}.`),
      ...watchAdvisories.map(({ advisory }) => `Official BLM current-condition advisory requires review: ${advisory.title}.`),
    ]),
    blocker_reasons: uniqueStrings([
      ...baseBlockers,
      ...activeMatches.map(({ closure }) => `Active official closure: ${closure.title}.`),
    ]),
    closure_summaries: uniqueStrings([
      ...baseClosures,
      ...matched.map(({ source, closure }) => closureSummary(source, closure)),
    ]),
    community_signal: {
      ...existingCommunitySignal,
      currentConditions: conditionSummary,
    },
  };

  if (activeMatches.length > 0) {
    verifiedRoute.recommendation_status = 'not_recommended';
    verifiedRoute.verification_status = 'not_recommended';
    verifiedRoute.confidence_score = Math.min(Number(verifiedRoute.confidence_score ?? 0), 74);
  }

  return {
    ...target,
    verifiedRoute,
    verifiedRouteSource: {
      ...target.verifiedRouteSource,
      metadata: {
        ...existingMetadata,
        currentConditions: conditionSummary,
      },
    },
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

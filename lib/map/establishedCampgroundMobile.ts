import type {
  CampLayerFetchFailureDiagnostic,
} from './campLayerFetchDiagnostics';
import type {
  CampgroundAvailabilityStatus,
  CampgroundStatus,
  ProviderId,
} from './establishedCampgrounds';
import type {
  EstablishedCampsite,
  EstablishedCampsiteFeatureCollection,
  EstablishedCampsiteAmenity,
  EstablishedCampsiteReservationStatus,
  EstablishedCampsiteSource,
  EstablishedCampsiteType,
} from './establishedCampsiteTypes';
import {
  dedupeEstablishedCampsitesForMap,
  toEstablishedCampsiteFeatureCollection,
} from './establishedCampsiteGeojsonAdapter';

export type EstablishedCampgroundSearchBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type EstablishedCampgroundSearchRecord = {
  id: string;
  name?: string;
  latitude: number;
  longitude: number;
  title?: string;
  subtitle?: string;
  type?: 'established_campground';
  category?: 'campground';
  facilityType?: string | null;
  managingAgency?: string | null;
  managingOrg?: string | null;
  reservationUrl?: string | null;
  detailUrl?: string | null;
  status?: CampgroundStatus | string | null;
  availabilityStatus?: CampgroundAvailabilityStatus | string | null;
  reservationStatus?: EstablishedCampsiteReservationStatus | string | null;
  siteCount?: number | null;
  siteTypes?: string[] | null;
  amenities?: string[] | null;
  sourceConfidence?: number | null;
  primaryProvider?: ProviderId | string | null;
  attribution?: string | null;
  lastSyncedAt?: string | null;
  lastAvailabilityCheckedAt?: string | null;
  lastVerifiedAt?: string | null;
  operatorName?: string | null;
  bookingUrl?: string | null;
  phone?: string | null;
  seasonDescription?: string | null;
  openingHours?: string | null;
  maxVehicleLengthFt?: number | string | null;
  tentAllowed?: boolean | string | null;
  rvAllowed?: boolean | string | null;
  trailersAllowed?: boolean | string | null;
};

export type EstablishedCampgroundsSearchResponse = {
  ok: boolean;
  records?: EstablishedCampgroundSearchRecord[];
  count?: number;
  error?: string;
  diagnostic?: CampLayerFetchFailureDiagnostic;
  geojson?: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id?: string | number;
      geometry: {
        type: 'Point';
        coordinates: [number, number];
      };
      properties: Record<string, unknown>;
    }>;
  };
  meta?: {
    bbox?: EstablishedCampgroundSearchBbox;
    routeId?: string | null;
    routeFilterApplied?: boolean;
    source?: string;
    fallbackReason?: string;
    featureCount?: number;
  };
};

export type EstablishedCampgroundDetailResponse = {
  ok: boolean;
  campsite?: EstablishedCampsite;
  error?: string;
};

export type EstablishedCampgroundsSearchRequest = {
  bbox: string;
  routeId?: string;
  limit: number;
  availability: 'any';
  openStatus: 'any';
};

export const ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION = 'campgrounds-search';
export const ESTABLISHED_CAMPGROUND_DETAIL_EDGE_FUNCTION = 'campground-detail';
export const ESTABLISHED_CAMPGROUNDS_SEARCH_LIMIT = 250;
export const ESTABLISHED_CAMPGROUNDS_CACHE_TTL_MS = 5 * 60 * 1000;
export const EMPTY_ESTABLISHED_CAMPGROUNDS_FEATURE_COLLECTION: EstablishedCampsiteFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};
export const ESTABLISHED_CAMPGROUNDS_UNAVAILABLE_ERROR =
  'Established campground search is temporarily unavailable. Try again after refreshing the map.';
export const ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR =
  'Malformed established campground search response.';
const FRESH_AVAILABILITY_MS = 60 * 60 * 1000;
const CAMPGROUND_IDENTITY_TERMS = [
  'campground',
  'campgrounds',
  'campsite',
  'campsites',
  'camp site',
  'camp sites',
  'camping',
  'rv park',
  'rv resort',
  'caravan site',
  'established camping facility',
];

const NON_CAMPGROUND_IDENTITY_TERMS = [
  'summit',
  'peak',
  'mountain',
  'administrative area',
  'land management office',
  'field office',
  'district office',
  'ranger station',
  'visitor center',
  'trailhead',
  'trail head',
  'wilderness',
  'blm area',
  'bureau of land management area',
  'national monument',
  'conservation area',
];

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text : null;
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function providerToSource(provider: unknown): EstablishedCampsiteSource {
  switch (normalizeToken(provider)) {
    case 'ridb':
    case 'recreation_gov':
      return 'RECREATION_GOV';
    case 'nps':
      return 'NPS';
    case 'osm':
      return 'OSM';
    case 'state':
      return 'STATE';
    case 'county':
      return 'COUNTY';
    case 'campflare':
    case 'active':
    case 'reserveamerica':
    case 'aspira':
    case 'manual':
    default:
      return 'UNKNOWN';
  }
}

function facilityTypeToCampsiteType(value: unknown): EstablishedCampsiteType {
  switch (normalizeToken(value)) {
    case 'rv_park':
    case 'caravan_site':
      return 'rv_park';
    case 'tent_site':
    case 'tent':
      return 'tent_site';
    case 'group_site':
    case 'group':
      return 'group_site';
    case 'cabin':
    case 'cabins':
      return 'cabin';
    case 'primitive_developed':
    case 'primitive':
      return 'primitive_developed';
    case 'campground':
    case 'camp_site':
    case 'campsite':
    default:
      return 'campground';
  }
}

function amenityToCampsiteAmenity(value: unknown): EstablishedCampsiteAmenity {
  const token = normalizeToken(value);
  if (['drinking_water', 'potable_water', 'water_spigot', 'water_available'].includes(token)) {
    return 'water';
  }
  if (['toilet', 'toilets', 'restroom', 'restrooms', 'vault_toilet', 'pit_toilet', 'flush_toilet'].includes(token)) {
    return 'toilets';
  }
  if (['shower', 'showers'].includes(token)) {
    return 'showers';
  }
  if (['electric_hookup', 'electrical_hookups', 'water_hookup', 'sewer_hookup', 'hookup', 'hookups'].includes(token)) {
    return 'hookups';
  }
  if (['dump', 'dumpstation', 'dump_station', 'sanitary_dump'].includes(token)) {
    return 'dump_station';
  }
  if (['picnic_table', 'picnic_tables', 'table'].includes(token)) {
    return 'picnic_table';
  }
  if (['fire_ring', 'fire_pit', 'firepit', 'grill'].includes(token)) {
    return 'fire_ring';
  }
  if (['trash', 'garbage', 'refuse'].includes(token)) {
    return 'trash';
  }
  if (['camp_host', 'host', 'campground_host'].includes(token)) {
    return 'camp_host';
  }
  if (['store', 'camp_store', 'general_store'].includes(token)) {
    return 'store';
  }
  if (['cell_service', 'cellular', 'phone_service', 'mobile_service'].includes(token)) {
    return 'cell_service';
  }
  if (
    [
      'water',
      'toilets',
      'showers',
      'hookups',
      'dump_station',
      'picnic_table',
      'fire_ring',
      'trash',
      'camp_host',
      'store',
      'cell_service',
    ].includes(token)
  ) {
    return token as EstablishedCampsiteAmenity;
  }
  return 'unknown';
}

function inferReservationStatus(record: EstablishedCampgroundSearchRecord): EstablishedCampsiteReservationStatus {
  const availability = normalizeToken(record.availabilityStatus);
  if (availability === 'first_come_first_served') return 'first_come';
  if (normalizeToken(record.reservationStatus) === 'first_come') return 'first_come';
  if (normalizeToken(record.reservationStatus) === 'mixed') return 'mixed';
  if (normalizeToken(record.reservationStatus) === 'required') return 'required';
  if (normalizeToken(record.reservationStatus) === 'reservable') return 'reservable';
  if (record.reservationUrl || normalizeToken(record.primaryProvider) === 'reserveamerica') {
    return 'reservable';
  }
  return 'unknown';
}

function boolOrUndefined(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  const token = normalizeToken(value);
  if (['true', 'yes', 'y', '1', 'allowed', 'available'].includes(token)) return true;
  if (['false', 'no', 'n', '0', 'not_allowed', 'unavailable'].includes(token)) return false;
  return undefined;
}

function inferAllowedFromSiteTypes(siteTypes: string[] | null, patterns: RegExp[]): boolean | undefined {
  if (!siteTypes?.length) return undefined;
  const text = siteTypes.join(' ').toLowerCase();
  return patterns.some((pattern) => pattern.test(text)) ? true : undefined;
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => cleanText(item)).filter((item): item is string => !!item);
}

function isValidPointCoordinates(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function identityText(record: EstablishedCampgroundSearchRecord): string {
  return [
    record.name,
    record.title,
    record.subtitle,
    record.facilityType,
    record.managingAgency,
    record.managingOrg,
    record.reservationUrl,
    record.detailUrl,
    ...(Array.isArray(record.siteTypes) ? record.siteTypes : []),
    ...(Array.isArray(record.amenities) ? record.amenities : []),
  ]
    .map((value) => cleanText(value)?.toLowerCase() ?? '')
    .filter(Boolean)
    .join(' ');
}

function hasEstablishedCampgroundIdentity(record: EstablishedCampgroundSearchRecord): boolean {
  const text = identityText(record);
  const hasCampgroundSignal = CAMPGROUND_IDENTITY_TERMS.some((term) => text.includes(term));
  if (!hasCampgroundSignal) return false;

  const hasNonCampgroundSignal = NON_CAMPGROUND_IDENTITY_TERMS.some((term) => text.includes(term));
  if (!hasNonCampgroundSignal) return true;

  const facilityType = cleanText(record.facilityType)?.toLowerCase() ?? '';
  const siteTypes = Array.isArray(record.siteTypes) ? record.siteTypes.map((value) => String(value).toLowerCase()) : [];
  const name = (cleanText(record.name) ?? cleanText(record.title) ?? '').toLowerCase();
  return (
    CAMPGROUND_IDENTITY_TERMS.some((term) => facilityType.includes(term)) ||
    siteTypes.some((value) => CAMPGROUND_IDENTITY_TERMS.some((term) => value.includes(term))) ||
    /\b(campground|campsite|camping|rv park|rv resort)\b/.test(name)
  );
}

export function buildEstablishedCampgroundsSearchRequest(
  bbox: EstablishedCampgroundSearchBbox,
  routeId?: string | null,
): EstablishedCampgroundsSearchRequest {
  return {
    bbox: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
      .map((value) => Number(value).toFixed(6))
      .join(','),
    ...(routeId ? { routeId } : {}),
    limit: ESTABLISHED_CAMPGROUNDS_SEARCH_LIMIT,
    availability: 'any',
    openStatus: 'any',
  };
}

export function buildEstablishedCampgroundsCacheKey(
  bbox: EstablishedCampgroundSearchBbox,
  routeId?: string | null,
): string {
  const rounded = [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat]
    .map((value) => Number(value).toFixed(3))
    .join(',');
  return `established-campgrounds:${rounded}:${routeId || 'viewport'}`;
}

export function isCampgroundAvailabilityFresh(value?: string | null, now = Date.now()): boolean {
  const text = cleanText(value);
  if (!text) return false;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) && now - timestamp <= FRESH_AVAILABILITY_MS;
}

export function formatCampgroundStatusLabel(status?: string | null): string {
  switch (normalizeToken(status)) {
    case 'open':
      return 'Open status reported';
    case 'closed':
      return 'Closed';
    case 'seasonal':
      return 'Seasonal';
    case 'temporarily_closed':
      return 'Temporarily closed';
    case 'verify':
      return 'Verify status';
    default:
      return 'Status unknown';
  }
}

export function formatCampgroundAvailabilityLabel(
  availabilityStatus?: string | null,
  lastAvailabilityCheckedAt?: string | null,
  now = Date.now(),
): string {
  const fresh = isCampgroundAvailabilityFresh(lastAvailabilityCheckedAt, now);
  switch (normalizeToken(availabilityStatus)) {
    case 'available':
      return fresh ? 'Available reported - verify with operator' : 'Availability unknown';
    case 'limited':
      return fresh ? 'Limited availability reported - verify with operator' : 'Availability unknown';
    case 'unavailable':
      return fresh ? 'Unavailable reported' : 'Availability unknown';
    case 'closed':
      return 'Closed';
    case 'stale':
      return 'Availability stale';
    default:
      return 'Availability unknown';
  }
}

export function friendlyEstablishedCampgroundError(message?: string | null): string {
  const text = String(message ?? '').trim();
  if (!text) return ESTABLISHED_CAMPGROUNDS_UNAVAILABLE_ERROR;
  const lower = text.toLowerCase();
  if (
    lower.includes('non-2xx') ||
    lower.includes('edge function') ||
    lower.includes('functionsfetcherror') ||
    lower.includes('failed to fetch')
  ) {
    return ESTABLISHED_CAMPGROUNDS_UNAVAILABLE_ERROR;
  }
  if (lower.includes('bbox')) {
    return 'Move or zoom the map, then try loading established campgrounds again.';
  }
  return text;
}

export function mapCampgroundRecordToEstablishedCampsite(
  record: EstablishedCampgroundSearchRecord,
): EstablishedCampsite | null {
  const latitude = numberOrNull(record.latitude);
  const longitude = numberOrNull(record.longitude);
  const id = cleanText(record.id);
  const name = cleanText(record.name) ?? cleanText(record.title);
  if (!id || !name || latitude == null || longitude == null) return null;
  if (!hasEstablishedCampgroundIdentity(record)) return null;

  const primaryProvider = cleanText(record.primaryProvider);
  const amenities = Array.from(
    new Set((Array.isArray(record.amenities) ? record.amenities : []).map(amenityToCampsiteAmenity)),
  );
  const siteTypes = Array.isArray(record.siteTypes)
    ? record.siteTypes.map((value) => cleanText(value)).filter((value): value is string => !!value)
    : null;
  const source = providerToSource(primaryProvider);
  const detailUrl = cleanText(record.detailUrl);
  const reservationUrl = cleanText(record.reservationUrl);
  const lastAvailabilityCheckedAt = cleanText(record.lastAvailabilityCheckedAt);
  const lastSyncedAt = cleanText(record.lastSyncedAt);

  return {
    id,
    name,
    latitude,
    longitude,
    type: 'established_campground',
    category: 'campground',
    campsiteType: facilityTypeToCampsiteType(record.facilityType),
    source,
    feeStatus: 'unknown',
    reservationStatus: inferReservationStatus(record),
    amenities: amenities.length > 0 ? amenities : ['unknown'],
    managingAgency: cleanText(record.managingAgency),
    managingOrg: cleanText(record.managingOrg),
    reservationUrl,
    detailUrl,
    status: cleanText(record.status) ?? 'unknown',
    availabilityStatus: cleanText(record.availabilityStatus) ?? 'unknown',
    siteCount: numberOrNull(record.siteCount),
    siteTypes,
    sourceConfidence: numberOrNull(record.sourceConfidence),
    primaryProvider,
    attribution: cleanText(record.attribution),
    lastSyncedAt,
    lastAvailabilityCheckedAt,
    lastVerifiedAt: cleanText(record.lastVerifiedAt),
    operatorName: cleanText(record.operatorName) ?? cleanText(record.managingOrg) ?? cleanText(record.managingAgency) ?? undefined,
    bookingUrl: cleanText(record.bookingUrl) ?? reservationUrl ?? detailUrl ?? undefined,
    phone: cleanText(record.phone) ?? undefined,
    seasonDescription: cleanText(record.seasonDescription) ?? undefined,
    openingHours: cleanText(record.openingHours) ?? undefined,
    maxVehicleLengthFt: numberOrNull(record.maxVehicleLengthFt) ?? undefined,
    tentAllowed:
      boolOrUndefined(record.tentAllowed) ??
      inferAllowedFromSiteTypes(siteTypes, [/\btent\b/, /\bcampground\b/, /\bcampsite\b/]),
    rvAllowed:
      boolOrUndefined(record.rvAllowed) ??
      inferAllowedFromSiteTypes(siteTypes, [/\brv\b/, /\btrailer\b/, /\brecreational vehicle\b/]),
    trailersAllowed:
      boolOrUndefined(record.trailersAllowed) ??
      inferAllowedFromSiteTypes(siteTypes, [/\btrailer\b/, /\brv\b/]),
    sourceUpdatedAt: lastAvailabilityCheckedAt ?? lastSyncedAt ?? undefined,
    requiresVerification: true,
  };
}

export function mapCampgroundSearchRecordsToEstablishedCampsites(
  records: EstablishedCampgroundSearchRecord[] | null | undefined,
): EstablishedCampsite[] {
  if (!Array.isArray(records)) return [];
  const campsites = records
    .map(mapCampgroundRecordToEstablishedCampsite)
    .filter((record): record is EstablishedCampsite => !!record);
  return dedupeEstablishedCampsitesForMap(campsites);
}

function isEstablishedCampgroundsFeatureCollection(value: unknown): value is EstablishedCampsiteFeatureCollection {
  const collection = toRecord(value);
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) return false;
  return collection.features.every((feature) => {
    const record = toRecord(feature);
    const geometry = toRecord(record?.geometry);
    const properties = toRecord(record?.properties);
    return (
      record?.type === 'Feature' &&
      geometry?.type === 'Point' &&
      isValidPointCoordinates(geometry.coordinates) &&
      !!properties &&
      typeof properties.id === 'string'
    );
  });
}

function normalizeSearchRecord(value: unknown): EstablishedCampgroundSearchRecord | null {
  const record = toRecord(value);
  if (!record) return null;
  const id = cleanText(record.id);
  const latitude = numberOrNull(record.latitude);
  const longitude = numberOrNull(record.longitude);
  if (!id || latitude == null || longitude == null) return null;

  return {
    id,
    name: cleanText(record.name) ?? undefined,
    title: cleanText(record.title) ?? undefined,
    subtitle: cleanText(record.subtitle) ?? undefined,
    latitude,
    longitude,
    type: record.type === 'established_campground' ? 'established_campground' : undefined,
    category: record.category === 'campground' ? 'campground' : undefined,
    facilityType: cleanText(record.facilityType),
    managingAgency: cleanText(record.managingAgency),
    managingOrg: cleanText(record.managingOrg),
    reservationUrl: cleanText(record.reservationUrl),
    detailUrl: cleanText(record.detailUrl),
    status: cleanText(record.status),
    availabilityStatus: cleanText(record.availabilityStatus),
    siteCount: numberOrNull(record.siteCount),
    siteTypes: stringList(record.siteTypes),
    amenities: stringList(record.amenities),
    sourceConfidence: numberOrNull(record.sourceConfidence),
    primaryProvider: cleanText(record.primaryProvider),
    attribution: cleanText(record.attribution),
    lastSyncedAt: cleanText(record.lastSyncedAt),
    lastAvailabilityCheckedAt: cleanText(record.lastAvailabilityCheckedAt),
    lastVerifiedAt: cleanText(record.lastVerifiedAt),
    operatorName: cleanText(record.operatorName),
    bookingUrl: cleanText(record.bookingUrl),
    phone: cleanText(record.phone),
    seasonDescription: cleanText(record.seasonDescription),
    openingHours: cleanText(record.openingHours),
    maxVehicleLengthFt: numberOrNull(record.maxVehicleLengthFt),
    tentAllowed: boolOrUndefined(record.tentAllowed),
    rvAllowed: boolOrUndefined(record.rvAllowed),
    trailersAllowed: boolOrUndefined(record.trailersAllowed),
  };
}

function featureToSearchRecord(
  feature: EstablishedCampsiteFeatureCollection['features'][number],
): EstablishedCampgroundSearchRecord | null {
  const properties = toRecord(feature.properties);
  const coordinates = feature.geometry.coordinates;
  return normalizeSearchRecord({
    ...properties,
    id: cleanText(properties?.id) ?? cleanText(feature.id),
    name: cleanText(properties?.name) ?? cleanText(properties?.title),
    title: cleanText(properties?.title) ?? cleanText(properties?.name),
    latitude: numberOrNull(properties?.latitude) ?? coordinates[1],
    longitude: numberOrNull(properties?.longitude) ?? coordinates[0],
  });
}

function firstCleanText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number != null) return number;
  }
  return null;
}

function firstStringList(...values: unknown[]): string[] | null {
  for (const value of values) {
    const list = stringList(value);
    if (list?.length) return list;
  }
  return null;
}

function firstBool(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    const bool = boolOrUndefined(value);
    if (typeof bool === 'boolean') return bool;
  }
  return undefined;
}

function availabilityRowsFromDetail(value: unknown): Record<string, unknown>[] {
  const availability = toRecord(value);
  if (!Array.isArray(availability?.rows)) return [];
  return availability.rows.map(toRecord).filter((row): row is Record<string, unknown> => !!row);
}

function reservationStatusFromAvailabilityRows(rows: readonly Record<string, unknown>[]): EstablishedCampsiteReservationStatus | null {
  if (!rows.length) return null;
  const hasReservable = rows.some((row) => boolOrUndefined(row.reservable) === true);
  const hasFirstCome = rows.some((row) => boolOrUndefined(row.firstComeFirstServed ?? row.first_come_first_served) === true);
  if (hasReservable && hasFirstCome) return 'mixed';
  if (hasReservable) return 'reservable';
  if (hasFirstCome) return 'first_come';
  return null;
}

function normalizeSearchRecords(value: unknown): EstablishedCampgroundSearchRecord[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const records = value.map(normalizeSearchRecord);
  if (records.some((record) => !record)) return null;
  return records as EstablishedCampgroundSearchRecord[];
}

export function normalizeEstablishedCampgroundsSearchResponse(raw: unknown): EstablishedCampgroundsSearchResponse {
  const record = toRecord(raw);
  if (!record) {
    return { ok: false, error: ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR, records: [], count: 0 };
  }

  if (record.ok === false) {
    return {
      ok: false,
      error: typeof record.error === 'string' ? record.error : ESTABLISHED_CAMPGROUNDS_UNAVAILABLE_ERROR,
      records: [],
      count: 0,
    };
  }

  if (record.ok !== true) {
    return { ok: false, error: ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR, records: [], count: 0 };
  }

  const geojson =
    record.geojson == null
      ? EMPTY_ESTABLISHED_CAMPGROUNDS_FEATURE_COLLECTION
      : isEstablishedCampgroundsFeatureCollection(record.geojson)
        ? record.geojson
        : null;
  if (!geojson) {
    return { ok: false, error: ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR, records: [], count: 0 };
  }

  const providedRecords = normalizeSearchRecords(record.records);
  if (record.records != null && !providedRecords) {
    return { ok: false, error: ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR, records: [], count: 0 };
  }

  const records =
    providedRecords && providedRecords.length > 0
      ? providedRecords
      : geojson.features.map(featureToSearchRecord).filter((item): item is EstablishedCampgroundSearchRecord => !!item);
  if (geojson.features.length > 0 && records.length !== geojson.features.length && !providedRecords?.length) {
    return { ok: false, error: ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR, records: [], count: 0 };
  }

  const campsites = mapCampgroundSearchRecordsToEstablishedCampsites(records);
  const featureCollection = toEstablishedCampsiteFeatureCollection(campsites);
  const meta = toRecord(record.meta);

  return {
    ok: true,
    records,
    count:
      featureCollection.features.length,
    geojson: featureCollection,
    ...(meta ? { meta: meta as EstablishedCampgroundsSearchResponse['meta'] } : {}),
  };
}

export function normalizeEstablishedCampgroundDetailResponse(raw: unknown): EstablishedCampgroundDetailResponse {
  const record = toRecord(raw);
  if (!record) {
    return { ok: false, error: ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR };
  }

  if (record.ok === false) {
    return {
      ok: false,
      error: typeof record.error === 'string' ? record.error : ESTABLISHED_CAMPGROUNDS_UNAVAILABLE_ERROR,
    };
  }

  if (record.ok !== true) {
    return { ok: false, error: ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR };
  }

  const marker = toRecord(record.marker);
  const campground = toRecord(record.campground);
  const freshness = toRecord(record.freshness);
  const availability = toRecord(record.availability);
  const detailEnrichment = toRecord(record.detailEnrichment);
  const sourceRows = Array.isArray(record.sources) ? record.sources : [];
  const availabilityRows = availabilityRowsFromDetail(availability);
  const detailSource: Record<string, unknown> = {
    ...(campground ?? {}),
    ...(marker ?? {}),
    ...(detailEnrichment ?? {}),
  };
  if (!marker && !campground && !detailEnrichment) {
    return { ok: false, error: ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR };
  }

  const effectiveStatus = cleanText(availability?.effectiveStatus);
  const reservationStatus = reservationStatusFromAvailabilityRows(availabilityRows);
  const siteTypes = firstStringList(detailSource.siteTypes, detailSource.site_types);
  const campsite = mapCampgroundRecordToEstablishedCampsite({
    id: firstCleanText(detailSource.id) ?? '',
    name: firstCleanText(detailSource.name, detailSource.title) ?? undefined,
    title: firstCleanText(detailSource.title, detailSource.name) ?? undefined,
    latitude: firstNumber(detailSource.latitude) ?? Number.NaN,
    longitude: firstNumber(detailSource.longitude) ?? Number.NaN,
    facilityType: firstCleanText(detailSource.facilityType, detailSource.facility_type),
    managingAgency: firstCleanText(detailSource.managingAgency, detailSource.managing_agency),
    managingOrg: firstCleanText(detailSource.managingOrg, detailSource.managing_org),
    reservationUrl: firstCleanText(detailSource.reservationUrl, detailSource.reservation_url, record.reservationUrl),
    detailUrl: firstCleanText(detailSource.detailUrl, detailSource.detail_url, record.detailUrl),
    status: firstCleanText(detailSource.status),
    availabilityStatus: effectiveStatus ?? firstCleanText(detailSource.availabilityStatus, detailSource.availability_status),
    reservationStatus,
    siteCount: firstNumber(detailSource.siteCount, detailSource.site_count),
    siteTypes,
    amenities: firstStringList(detailSource.amenities),
    sourceConfidence: firstNumber(detailSource.sourceConfidence, detailSource.source_confidence),
    primaryProvider: firstCleanText(detailSource.primaryProvider, detailSource.primary_provider),
    attribution: firstCleanText(detailSource.attribution, record.attribution),
    lastSyncedAt: firstCleanText(detailSource.lastSyncedAt, detailSource.last_synced_at, freshness?.lastSyncedAt),
    lastAvailabilityCheckedAt: firstCleanText(
      detailSource.lastAvailabilityCheckedAt,
      detailSource.last_availability_checked_at,
      freshness?.lastAvailabilityCheckedAt,
    ),
    lastVerifiedAt: firstCleanText(detailSource.lastVerifiedAt, detailSource.last_verified_at, freshness?.lastVerifiedAt),
    operatorName: firstCleanText(detailSource.operatorName, detailSource.operator_name),
    bookingUrl: firstCleanText(detailSource.bookingUrl, detailSource.booking_url),
    phone: firstCleanText(detailSource.phone, detailSource.phoneNumber, detailSource.phone_number),
    seasonDescription: firstCleanText(
      detailSource.seasonDescription,
      detailSource.season_description,
      detailSource.openSeason,
      detailSource.open_season,
    ),
    openingHours: firstCleanText(detailSource.openingHours, detailSource.opening_hours, detailSource.hours),
    maxVehicleLengthFt: firstNumber(
      detailSource.maxVehicleLengthFt,
      detailSource.max_vehicle_length_ft,
      detailSource.maxVehicleLength,
      detailSource.max_vehicle_length,
    ),
    tentAllowed: firstBool(detailSource.tentAllowed, detailSource.tent_allowed),
    rvAllowed: firstBool(detailSource.rvAllowed, detailSource.rv_allowed),
    trailersAllowed: firstBool(detailSource.trailersAllowed, detailSource.trailers_allowed),
  });

  if (!campsite) {
    return { ok: false, error: ESTABLISHED_CAMPGROUNDS_MALFORMED_RESPONSE_ERROR };
  }

  return {
    ok: true,
    campsite: {
      ...campsite,
      liveDetailFetchedAt: new Date().toISOString(),
      sourceRecordCount: sourceRows.length,
      availabilityRecordCount: availabilityRows.length,
    },
  };
}

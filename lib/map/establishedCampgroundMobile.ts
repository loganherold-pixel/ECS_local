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
import { toEstablishedCampsiteFeatureCollection } from './establishedCampsiteGeojsonAdapter';

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
  siteCount?: number | null;
  siteTypes?: string[] | null;
  amenities?: string[] | null;
  sourceConfidence?: number | null;
  primaryProvider?: ProviderId | string | null;
  attribution?: string | null;
  lastSyncedAt?: string | null;
  lastAvailabilityCheckedAt?: string | null;
  lastVerifiedAt?: string | null;
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

export type EstablishedCampgroundsSearchRequest = {
  bbox: string;
  routeId?: string;
  limit: number;
  availability: 'any';
  openStatus: 'any';
};

export const ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION = 'campgrounds-search';
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
  if (record.reservationUrl || normalizeToken(record.primaryProvider) === 'reserveamerica') {
    return 'reservable';
  }
  return 'unknown';
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
    operatorName: cleanText(record.managingOrg) ?? cleanText(record.managingAgency) ?? undefined,
    bookingUrl: reservationUrl ?? detailUrl ?? undefined,
    sourceUpdatedAt: lastAvailabilityCheckedAt ?? lastSyncedAt ?? undefined,
    requiresVerification: true,
  };
}

export function mapCampgroundSearchRecordsToEstablishedCampsites(
  records: EstablishedCampgroundSearchRecord[] | null | undefined,
): EstablishedCampsite[] {
  if (!Array.isArray(records)) return [];
  return records
    .map(mapCampgroundRecordToEstablishedCampsite)
    .filter((record): record is EstablishedCampsite => !!record);
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
  const featureCollection =
    geojson.features.length > 0 || !providedRecords
      ? geojson
      : toEstablishedCampsiteFeatureCollection(campsites);
  const meta = toRecord(record.meta);

  return {
    ok: true,
    records,
    count:
      typeof record.count === 'number'
        ? record.count
        : featureCollection.features.length,
    geojson: featureCollection,
    ...(meta ? { meta: meta as EstablishedCampgroundsSearchResponse['meta'] } : {}),
  };
}

import {
  buildCampgroundMarker,
  normalizeAmenity,
  normalizeAvailabilityStatus,
  normalizeCampgroundStatus,
  normalizeSiteType,
  type CampgroundAvailabilityStatus,
  type CampgroundStatus,
  type EstablishedCampground,
  type ProviderId,
} from '../../../lib/map/establishedCampgrounds.ts';

export type CampgroundSearchAvailabilityFilter =
  | 'any'
  | 'available_now'
  | 'reservable'
  | 'first_come_first_served';

export type CampgroundSearchOpenStatusFilter = 'any' | 'open' | 'seasonal' | 'unknown';

export type CampgroundSearchParams = {
  bbox: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
  routeId?: string | null;
  radiusMiles?: number | null;
  siteTypes?: string[];
  amenities?: string[];
  availability?: CampgroundSearchAvailabilityFilter;
  openStatus?: CampgroundSearchOpenStatusFilter;
  minSourceConfidence?: number | null;
  limit: number;
};

export type CampgroundDbRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  facility_type: string | null;
  managing_agency: string | null;
  managing_org: string | null;
  reservation_url: string | null;
  detail_url: string | null;
  status: CampgroundStatus | string | null;
  availability_status: CampgroundAvailabilityStatus | string | null;
  site_count: number | null;
  site_types: string[] | null;
  amenities: string[] | null;
  source_confidence: number | string | null;
  primary_provider: ProviderId | string | null;
  attribution: string | null;
  last_synced_at: string | null;
  last_verified_at: string | null;
  last_availability_checked_at?: string | null;
};

export type CampgroundAvailabilityRow = {
  campground_id: string;
  provider_id: ProviderId | string;
  date: string | null;
  availability_status: CampgroundAvailabilityStatus | string | null;
  available_site_count: number | null;
  reservable: boolean | null;
  first_come_first_served: boolean | null;
  last_checked_at: string | null;
  expires_at: string | null;
};

export type CampgroundSourceSummaryRow = {
  provider_id: ProviderId | string;
  provider_record_id: string;
  source_url: string | null;
  raw_json?: unknown;
  payload_hash: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

export type CampgroundMarkerRecord = ReturnType<typeof buildCampgroundMarker> & {
  facilityType: string;
  managingAgency: string | null;
  managingOrg: string | null;
  reservationUrl: string | null;
  detailUrl: string | null;
  status: CampgroundStatus;
  availabilityStatus: CampgroundAvailabilityStatus;
  siteCount: number | null;
  siteTypes: string[] | null;
  amenities: string[] | null;
  sourceConfidence: number;
  primaryProvider: ProviderId | string | null;
  lastSyncedAt: string | null;
  lastVerifiedAt: string | null;
  lastAvailabilityCheckedAt: string | null;
};

export type CampgroundDetailResponse = {
  campground: EstablishedCampground;
  marker: CampgroundMarkerRecord;
  sources: Array<{
    providerId: string;
    providerRecordId: string;
    sourceUrl: string | null;
    payloadHash: string | null;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
  }>;
  availability: {
    effectiveStatus: CampgroundAvailabilityStatus;
    rows: Array<{
      providerId: string;
      date: string | null;
      availabilityStatus: CampgroundAvailabilityStatus;
      availableSiteCount: number | null;
      reservable: boolean | null;
      firstComeFirstServed: boolean | null;
      lastCheckedAt: string | null;
      expiresAt: string | null;
      isFresh: boolean;
    }>;
  };
  detailEnrichment: {
    operatorName: string | null;
    phone: string | null;
    seasonDescription: string | null;
    openingHours: string | null;
    maxVehicleLengthFt: number | null;
    tentAllowed: boolean | null;
    rvAllowed: boolean | null;
    trailersAllowed: boolean | null;
    amenities: string[] | null;
  };
  attribution: string | null;
  freshness: {
    lastSyncedAt: string | null;
    lastVerifiedAt: string | null;
    lastAvailabilityCheckedAt: string | null;
  };
  reservationUrl: string | null;
  detailUrl: string | null;
};

export type CampgroundSearchFeature = {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: CampgroundMarkerRecord & {
    id: string;
    name: string;
    source: string;
  };
};

export type CampgroundSearchFeatureCollection = {
  type: 'FeatureCollection';
  features: CampgroundSearchFeature[];
};

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 1000;
const DEFAULT_AVAILABILITY_TTL_MS = 60 * 60 * 1000;

export const CAMPING_IDENTITY_TERMS = [
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
  'recreation site campground',
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

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function walkJson(value: unknown, visit: (key: string, child: unknown) => void, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 5) return;
  if (Array.isArray(value)) {
    value.forEach((child) => walkJson(child, visit, depth + 1));
    return;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    visit(key, child);
    walkJson(child, visit, depth + 1);
  });
}

function firstRawField(sources: CampgroundSourceSummaryRow[], keys: string[]): unknown {
  const wanted = new Set(keys.map(normalizeKey));
  for (const source of sources) {
    let found: unknown;
    walkJson(source.raw_json, (key, child) => {
      if (found !== undefined) return;
      if (wanted.has(normalizeKey(key))) found = child;
    });
    if (found !== undefined && found !== null && cleanText(found) !== '') return found;
  }
  return null;
}

function rawStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter((item): item is string => !!item);
  }
  const text = cleanText(value);
  return text ? text.split(/[,;|]/).map((item) => item.trim()).filter(Boolean) : [];
}

function rawBool(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  const token = cleanText(value)?.toLowerCase();
  if (!token) return null;
  if (['true', 'yes', 'y', '1', 'allowed', 'available'].includes(token)) return true;
  if (['false', 'no', 'n', '0', 'not allowed', 'unavailable'].includes(token)) return false;
  return null;
}

function sourceDetailEnrichment(sources: CampgroundSourceSummaryRow[]) {
  const maxVehicleLength = numberOrNull(firstRawField(sources, [
    'maxVehicleLengthFt',
    'max_vehicle_length_ft',
    'maxVehicleLength',
    'maxRVLength',
    'MaxVehicleLength',
  ]));
  const amenities = rawStringList(firstRawField(sources, [
    'amenities',
    'facilityAmenities',
    'FacilityAmenity',
    'CampsiteAmenities',
    'attributes',
  ]));

  return {
    operatorName: cleanText(firstRawField(sources, ['operatorName', 'operator', 'manager', 'OrgName', 'organization'])),
    phone: cleanText(firstRawField(sources, ['phone', 'phoneNumber', 'FacilityPhone', 'FacilityPhoneNumber', 'contactPhone'])),
    seasonDescription: cleanText(firstRawField(sources, ['seasonDescription', 'openSeason', 'OperatingSeason', 'season', 'Season'])),
    openingHours: cleanText(firstRawField(sources, ['openingHours', 'hours', 'OperatingHours', 'facilityHours'])),
    maxVehicleLengthFt: maxVehicleLength,
    tentAllowed: rawBool(firstRawField(sources, ['tentAllowed', 'tent', 'tentSitesAllowed'])),
    rvAllowed: rawBool(firstRawField(sources, ['rvAllowed', 'rv', 'rvSitesAllowed'])),
    trailersAllowed: rawBool(firstRawField(sources, ['trailersAllowed', 'trailerAllowed', 'trailer'])),
    amenities: amenities.length ? amenities : null,
  };
}

function numberOrNull(value: unknown): number | null {
  const candidate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeStringList(value: unknown, normalize: (item: unknown) => string): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return Array.from(new Set(values.map((item) => normalize(item)).filter((item) => item !== 'unknown' && item.length > 0)));
}

function identityText(row: CampgroundDbRow): string {
  return [
    row.name,
    row.facility_type,
    row.managing_agency,
    row.managing_org,
    row.reservation_url,
    row.detail_url,
    ...(jsonArray(row.site_types).map(String)),
    ...(jsonArray(row.amenities).map(String)),
  ]
    .map((value) => cleanText(value)?.toLowerCase() ?? '')
    .filter(Boolean)
    .join(' ');
}

function hasCampingIdentity(text: string): boolean {
  return CAMPING_IDENTITY_TERMS.some((term) => text.includes(term));
}

function hasNonCampgroundIdentity(text: string): boolean {
  return NON_CAMPGROUND_IDENTITY_TERMS.some((term) => text.includes(term));
}

export function rowHasEstablishedCampgroundIdentity(row: CampgroundDbRow): boolean {
  const text = identityText(row);
  const hasCampSignal = hasCampingIdentity(text);
  if (!hasCampSignal) return false;

  if (!hasNonCampgroundIdentity(text)) return true;

  const facility = cleanText(row.facility_type)?.toLowerCase() ?? '';
  const siteTypes = jsonArray(row.site_types).map((value) => String(value).toLowerCase());
  const name = cleanText(row.name)?.toLowerCase() ?? '';

  return (
    hasCampingIdentity(facility) ||
    siteTypes.some(hasCampingIdentity) ||
    /\b(campground|campsite|camping|rv park|rv resort)\b/.test(name)
  );
}

function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseBbox(value: unknown): CampgroundSearchParams['bbox'] | null {
  const parts = typeof value === 'string' ? value.split(',').map((part) => Number(part.trim())) : [];
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [minLngRaw, minLatRaw, maxLngRaw, maxLatRaw] = parts;
  const minLng = Math.min(minLngRaw, maxLngRaw);
  const maxLng = Math.max(minLngRaw, maxLngRaw);
  const minLat = Math.min(minLatRaw, maxLatRaw);
  const maxLat = Math.max(minLatRaw, maxLatRaw);
  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
  if (minLat === maxLat || minLng === maxLng) return null;
  return { minLng, minLat, maxLng, maxLat };
}

export function parseCampgroundSearchParams(input: URLSearchParams | Record<string, unknown>): CampgroundSearchParams | null {
  const getValue = (key: string): unknown =>
    input instanceof URLSearchParams ? input.get(key) : input[key];
  const bbox = parseBbox(getValue('bbox'));
  if (!bbox) return null;

  const availability = cleanText(getValue('availability')) as CampgroundSearchAvailabilityFilter | null;
  const openStatus = cleanText(getValue('openStatus')) as CampgroundSearchOpenStatusFilter | null;
  const limit = Math.floor(clamp(numberOrNull(getValue('limit')) ?? DEFAULT_LIMIT, 1, MAX_LIMIT));
  const radiusMiles = numberOrNull(getValue('radiusMiles'));
  const minSourceConfidence = numberOrNull(getValue('minSourceConfidence'));

  return {
    bbox,
    routeId: cleanText(getValue('routeId')),
    radiusMiles: radiusMiles != null && radiusMiles > 0 ? clamp(radiusMiles, 0.1, 250) : null,
    siteTypes: normalizeStringList(getValue('siteTypes'), normalizeSiteType),
    amenities: normalizeStringList(getValue('amenities'), normalizeAmenity),
    availability: ['available_now', 'reservable', 'first_come_first_served'].includes(availability ?? '')
      ? availability ?? 'any'
      : 'any',
    openStatus: ['open', 'seasonal', 'unknown'].includes(openStatus ?? '') ? openStatus ?? 'any' : 'any',
    minSourceConfidence: minSourceConfidence != null ? clamp(minSourceConfidence, 0, 100) : null,
    limit,
  };
}

export function distanceMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.7613;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthMiles * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isAvailabilityFresh(row: CampgroundAvailabilityRow, now = new Date()): boolean {
  const expiresAt = cleanText(row.expires_at);
  if (expiresAt) {
    const expires = Date.parse(expiresAt);
    return Number.isFinite(expires) && expires >= now.getTime();
  }

  const checkedAt = cleanText(row.last_checked_at);
  if (!checkedAt) return false;
  const checked = Date.parse(checkedAt);
  return Number.isFinite(checked) && now.getTime() - checked <= DEFAULT_AVAILABILITY_TTL_MS;
}

export function effectiveAvailabilityStatus(
  campground: CampgroundDbRow,
  availabilityRows: CampgroundAvailabilityRow[] = [],
  now = new Date(),
): CampgroundAvailabilityStatus {
  const freshRows = availabilityRows.filter((row) => isAvailabilityFresh(row, now));
  const freshStatus = freshRows
    .map((row) => normalizeAvailabilityStatus(row.availability_status))
    .find((status) => status !== 'unknown' && status !== 'stale');
  if (freshStatus) return freshStatus;

  const checkedAt = cleanText(campground.last_availability_checked_at);
  if (!checkedAt) return 'unknown';
  const checked = Date.parse(checkedAt);
  if (!Number.isFinite(checked) || now.getTime() - checked > DEFAULT_AVAILABILITY_TTL_MS) return 'unknown';
  return normalizeAvailabilityStatus(campground.availability_status);
}

function toEstablishedCampground(
  row: CampgroundDbRow,
  sources: CampgroundSourceSummaryRow[] = [],
  availabilityRows: CampgroundAvailabilityRow[] = [],
  now = new Date(),
): EstablishedCampground {
  return {
    id: row.id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    facilityType: cleanText(row.facility_type) ?? 'campground',
    managingAgency: cleanText(row.managing_agency),
    managingOrg: cleanText(row.managing_org),
    reservationUrl: cleanText(row.reservation_url),
    detailUrl: cleanText(row.detail_url),
    status: normalizeCampgroundStatus(row.status),
    availabilityStatus: effectiveAvailabilityStatus(row, availabilityRows, now),
    siteCount: numberOrNull(row.site_count),
    siteTypes: jsonArray(row.site_types).map(String),
    amenities: jsonArray(row.amenities).map(String),
    sourceConfidence: clamp(numberOrNull(row.source_confidence) ?? 0, 0, 100),
    primaryProvider: cleanText(row.primary_provider) as ProviderId | null,
    attribution: cleanText(row.attribution),
    lastSyncedAt: cleanText(row.last_synced_at),
    lastAvailabilityCheckedAt: cleanText(row.last_availability_checked_at),
    lastVerifiedAt: cleanText(row.last_verified_at),
    sources: sources.map((source) => ({
      providerId: cleanText(source.provider_id) as ProviderId,
      providerRecordId: cleanText(source.provider_record_id) ?? '',
      sourceUrl: cleanText(source.source_url),
      rawJson: null,
      payloadHash: cleanText(source.payload_hash),
      firstSeenAt: cleanText(source.first_seen_at) ?? '',
      lastSeenAt: cleanText(source.last_seen_at) ?? '',
    })),
  };
}

export function buildCampgroundSearchRecord(
  row: CampgroundDbRow,
  availabilityRows: CampgroundAvailabilityRow[] = [],
  now = new Date(),
): CampgroundMarkerRecord {
  const campground = toEstablishedCampground(row, [], availabilityRows, now);
  const marker = buildCampgroundMarker(campground);
  return {
    ...marker,
    facilityType: campground.facilityType,
    managingAgency: campground.managingAgency,
    managingOrg: campground.managingOrg,
    reservationUrl: campground.reservationUrl,
    detailUrl: campground.detailUrl,
    status: campground.status,
    availabilityStatus: campground.availabilityStatus,
    siteCount: campground.siteCount,
    siteTypes: campground.siteTypes,
    amenities: campground.amenities,
    sourceConfidence: campground.sourceConfidence,
    primaryProvider: campground.primaryProvider,
    lastSyncedAt: campground.lastSyncedAt,
    lastVerifiedAt: campground.lastVerifiedAt,
    lastAvailabilityCheckedAt: campground.lastAvailabilityCheckedAt ?? null,
  };
}

export function buildCampgroundSearchFeatureCollection(
  records: CampgroundMarkerRecord[],
): CampgroundSearchFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: records
      .filter((record) => (
        Number.isFinite(record.latitude) &&
        Number.isFinite(record.longitude) &&
        record.latitude >= -90 &&
        record.latitude <= 90 &&
        record.longitude >= -180 &&
        record.longitude <= 180
      ))
      .map((record) => {
        const source = cleanText(record.primaryProvider) ?? cleanText(record.attribution) ?? 'unknown';
        return {
          type: 'Feature' as const,
          id: record.id,
          geometry: {
            type: 'Point' as const,
            coordinates: [record.longitude, record.latitude] as [number, number],
          },
          properties: {
            ...record,
            id: record.id,
            name: record.title,
            source,
          },
        };
      }),
  };
}

function rowMatchesList(rowValues: string[] | null, required: string[]): boolean {
  if (!required.length) return true;
  const values = new Set(jsonArray(rowValues).map((value) => String(value)));
  return required.every((requiredValue) => values.has(requiredValue));
}

function rowMatchesAvailability(
  row: CampgroundDbRow,
  availabilityRows: CampgroundAvailabilityRow[],
  filter: CampgroundSearchAvailabilityFilter,
  now: Date,
): boolean {
  if (filter === 'any') return true;
  const freshRows = availabilityRows.filter((availability) => isAvailabilityFresh(availability, now));
  if (filter === 'available_now') {
    return effectiveAvailabilityStatus(row, freshRows, now) === 'available';
  }
  if (filter === 'reservable') {
    return freshRows.some((availability) => availability.reservable === true);
  }
  if (filter === 'first_come_first_served') {
    return freshRows.some((availability) => availability.first_come_first_served === true);
  }
  return true;
}

export function filterCampgroundSearchRows(
  rows: CampgroundDbRow[],
  availabilityByCampgroundId: Map<string, CampgroundAvailabilityRow[]>,
  params: CampgroundSearchParams,
  now = new Date(),
): CampgroundMarkerRecord[] {
  const center = {
    latitude: (params.bbox.minLat + params.bbox.maxLat) / 2,
    longitude: (params.bbox.minLng + params.bbox.maxLng) / 2,
  };

  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      if (normalizeCampgroundStatus(row.status) === 'removed') return false;
      if (!rowHasEstablishedCampgroundIdentity(row)) return false;
      if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return false;
      if (row.latitude < -90 || row.latitude > 90 || row.longitude < -180 || row.longitude > 180) return false;
      if (row.latitude < params.bbox.minLat || row.latitude > params.bbox.maxLat) return false;
      if (row.longitude < params.bbox.minLng || row.longitude > params.bbox.maxLng) return false;
      if (params.radiusMiles != null && distanceMiles(center, { latitude: row.latitude, longitude: row.longitude }) > params.radiusMiles) return false;
      if (params.minSourceConfidence != null && (numberOrNull(row.source_confidence) ?? 0) < params.minSourceConfidence) return false;
      if (params.openStatus !== 'any' && normalizeCampgroundStatus(row.status) !== params.openStatus) return false;
      if (!rowMatchesList(row.site_types, params.siteTypes ?? [])) return false;
      if (!rowMatchesList(row.amenities, params.amenities ?? [])) return false;
      if (!rowMatchesAvailability(row, availabilityByCampgroundId.get(row.id) ?? [], params.availability ?? 'any', now)) return false;
      return true;
    })
    .map((row) => buildCampgroundSearchRecord(row, availabilityByCampgroundId.get(row.id) ?? [], now))
    .sort((a, b) => b.sourceConfidence - a.sourceConfidence || a.title.localeCompare(b.title))
    .slice(0, params.limit);
}

export function groupAvailabilityRows(rows: CampgroundAvailabilityRow[]): Map<string, CampgroundAvailabilityRow[]> {
  const grouped = new Map<string, CampgroundAvailabilityRow[]>();
  for (const row of rows) {
    grouped.set(row.campground_id, [...(grouped.get(row.campground_id) ?? []), row]);
  }
  return grouped;
}

export function buildCampgroundDetailResponse(
  row: CampgroundDbRow,
  sources: CampgroundSourceSummaryRow[],
  availabilityRows: CampgroundAvailabilityRow[],
  now = new Date(),
): CampgroundDetailResponse {
  const campground = toEstablishedCampground(row, sources, availabilityRows, now);
  return {
    campground,
    marker: buildCampgroundSearchRecord(row, availabilityRows, now),
    sources: sources.map((source) => ({
      providerId: cleanText(source.provider_id) ?? 'unknown',
      providerRecordId: cleanText(source.provider_record_id) ?? '',
      sourceUrl: cleanText(source.source_url),
      rawJson: null,
      payloadHash: cleanText(source.payload_hash),
      firstSeenAt: cleanText(source.first_seen_at),
      lastSeenAt: cleanText(source.last_seen_at),
    })),
    availability: {
      effectiveStatus: campground.availabilityStatus,
      rows: availabilityRows.map((availability) => ({
        providerId: cleanText(availability.provider_id) ?? 'unknown',
        date: cleanText(availability.date),
        availabilityStatus: normalizeAvailabilityStatus(availability.availability_status),
        availableSiteCount: numberOrNull(availability.available_site_count),
        reservable: availability.reservable,
        firstComeFirstServed: availability.first_come_first_served,
        lastCheckedAt: cleanText(availability.last_checked_at),
        expiresAt: cleanText(availability.expires_at),
        isFresh: isAvailabilityFresh(availability, now),
      })),
    },
    detailEnrichment: sourceDetailEnrichment(sources),
    attribution: campground.attribution,
    freshness: {
      lastSyncedAt: campground.lastSyncedAt,
      lastVerifiedAt: campground.lastVerifiedAt,
      lastAvailabilityCheckedAt: campground.lastAvailabilityCheckedAt ?? null,
    },
    reservationUrl: campground.reservationUrl,
    detailUrl: campground.detailUrl,
  };
}

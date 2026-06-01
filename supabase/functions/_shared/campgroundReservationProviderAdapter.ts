import {
  computePayloadHash,
  normalizeAmenity,
  normalizeAvailabilityStatus,
  normalizeCampgroundName,
  normalizeCampgroundStatus,
  normalizeSiteType,
  safeProviderError,
  type CampgroundAvailabilityStatus,
  type CampgroundStatus,
  type JsonValue,
  type ProviderId,
} from '../../../lib/map/establishedCampgrounds.ts';

export type ReservationProviderId = 'active' | 'reserveamerica' | 'aspira';
export type ReservationProviderRecord = Record<string, unknown>;

export type ReservationProviderPage = {
  data?: ReservationProviderRecord[];
  results?: ReservationProviderRecord[];
  records?: ReservationProviderRecord[];
  facilities?: ReservationProviderRecord[];
  campgrounds?: ReservationProviderRecord[];
  items?: ReservationProviderRecord[];
  nextCursor?: string | null;
  next_cursor?: string | null;
  cursor?: string | null;
  hasMore?: boolean;
  has_more?: boolean;
  total?: number | string;
  limit?: number | string;
  offset?: number | string;
};

export type ReservationProviderQuery = {
  providerId: ReservationProviderId;
  baseUrl: string;
  limit: number;
  cursor?: string | null;
  offset?: number;
  state?: string;
  updatedSince?: string;
};

export type CampgroundUpsertRow = {
  name: string;
  latitude: number;
  longitude: number;
  facility_type: string;
  managing_agency: string | null;
  managing_org: string | null;
  reservation_url: string | null;
  detail_url: string | null;
  status: CampgroundStatus;
  availability_status: CampgroundAvailabilityStatus;
  site_count: number | null;
  site_types: string[] | null;
  amenities: string[] | null;
  source_confidence: number;
  primary_provider: ProviderId;
  attribution: string | null;
  last_synced_at: string;
  last_verified_at: string | null;
};

export type SourceRecordUpsertRow = {
  campground_id?: string;
  provider_id: ReservationProviderId;
  provider_record_id: string;
  source_url: string | null;
  raw_json: JsonValue | null;
  payload_hash: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type NormalizedReservationCampground = {
  providerId: ReservationProviderId;
  providerRecordId: string;
  normalizedName: string;
  campground: CampgroundUpsertRow;
  sourceRecord: SourceRecordUpsertRow;
};

export type ExistingCampgroundCandidate = {
  id: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  managing_agency?: string | null;
  managing_org?: string | null;
  primary_provider?: ProviderId | string | null;
  source_confidence?: number | null;
  reservation_url?: string | null;
  detail_url?: string | null;
  attribution?: string | null;
};

export type ExistingReservationSourceRecord = {
  campground_id: string | null;
  first_seen_at: string | null;
};

export type ReservationSyncRows = {
  campground: CampgroundUpsertRow;
  sourceRecord: SourceRecordUpsertRow & { campground_id: string };
};

const MATCH_DISTANCE_MILES = 0.4;
const SOURCE_CONFIDENCE: Record<ReservationProviderId, number> = {
  active: 82,
  reserveamerica: 84,
  aspira: 84,
};

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text : null;
}

function numberOrNull(value: unknown): number | null {
  const candidate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function integerOrNull(value: unknown): number | null {
  const candidate = numberOrNull(value);
  if (candidate == null) return null;
  return Number.isInteger(candidate) && candidate >= 0 ? candidate : null;
}

function validLatitude(value: unknown): number | null {
  const candidate = numberOrNull(value);
  return candidate != null && candidate >= -90 && candidate <= 90 ? candidate : null;
}

function validLongitude(value: unknown): number | null {
  const candidate = numberOrNull(value);
  return candidate != null && candidate >= -180 && candidate <= 180 ? candidate : null;
}

function jsonValue(value: unknown): JsonValue | null {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => jsonValue(item)).filter((item): item is JsonValue => item !== undefined);
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const normalized = jsonValue(nested);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  }
  return String(value);
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function normalizeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const text = cleanText(value);
  return text ? text.split(/[;,|]/g).map((piece) => piece.trim()).filter(Boolean) : [];
}

function collectObjectText(value: unknown, fields: string[]): string[] {
  return normalizeArray(value).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    return fields.map((field) => cleanText((item as Record<string, unknown>)[field])).filter(Boolean) as string[];
  });
}

function normalizeAmenities(record: ReservationProviderRecord): string[] | null {
  const candidates = [
    ...normalizeArray(record.amenities),
    ...normalizeArray(record.Amenities),
    ...collectObjectText(record.facilityAmenities, ['name', 'label', 'title']),
    ...collectObjectText(record.campsiteAmenities, ['name', 'label', 'title']),
  ];
  const description = cleanText(record.description ?? record.Description);
  if (description) candidates.push(description);

  const normalized = Array.from(
    new Set(candidates.map(normalizeAmenity).filter((amenity) => amenity !== 'unknown')),
  );
  return normalized.length > 0 ? normalized : null;
}

function normalizeSiteTypes(record: ReservationProviderRecord): string[] | null {
  const candidates = [
    record.facilityType,
    record.FacilityType,
    record.type,
    record.siteType,
    record.campsiteType,
    ...normalizeArray(record.siteTypes),
    ...collectObjectText(record.sites, ['type', 'siteType', 'name']),
    ...collectObjectText(record.campsites, ['type', 'siteType', 'name']),
  ];
  const normalized = Array.from(
    new Set(candidates.map(normalizeSiteType).filter((siteType) => siteType !== 'unknown')),
  );
  return normalized.length > 0 ? normalized : ['campground'];
}

function readSiteCount(record: ReservationProviderRecord): number | null {
  const direct = integerOrNull(record.siteCount ?? record.totalSites ?? record.campsiteCount ?? record.TotalSites);
  if (direct != null) return direct;
  const sites = record.sites ?? record.campsites;
  return Array.isArray(sites) ? sites.length : null;
}

function readCoordinates(record: ReservationProviderRecord): { latitude: number; longitude: number } | null {
  const latitude = validLatitude(record.latitude ?? record.lat ?? record.Latitude ?? record.facilityLatitude);
  const longitude = validLongitude(record.longitude ?? record.lng ?? record.lon ?? record.Longitude ?? record.facilityLongitude);
  if (latitude != null && longitude != null) return { latitude, longitude };

  const location = record.location;
  if (location && typeof location === 'object') {
    const row = location as Record<string, unknown>;
    const nestedLat = validLatitude(row.latitude ?? row.lat);
    const nestedLng = validLongitude(row.longitude ?? row.lng ?? row.lon);
    if (nestedLat != null && nestedLng != null) return { latitude: nestedLat, longitude: nestedLng };
  }

  return null;
}

export function normalizeReservationProviderMatchName(value: unknown): string {
  return normalizeCampgroundName(value)
    .toLowerCase()
    .replace(/\b(campground|campgrounds|camp|cg|rv park|rv resort|recreation area|reserve)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
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

export function buildReservationProviderCampgroundsUrl(query: ReservationProviderQuery): string {
  const baseUrl = query.baseUrl.replace(/\/$/, '');
  const url = new URL(`${baseUrl}/campgrounds`);
  url.searchParams.set('limit', String(Math.max(1, Math.min(query.limit, 100))));
  if (query.cursor) url.searchParams.set('cursor', query.cursor);
  if (Number.isFinite(query.offset)) url.searchParams.set('offset', String(Math.max(0, Number(query.offset))));
  if (query.state) url.searchParams.set('state', query.state.trim().toUpperCase());
  if (query.updatedSince) url.searchParams.set('updated_since', query.updatedSince);
  return url.toString();
}

export function getReservationProviderPageRecords(page: ReservationProviderPage): ReservationProviderRecord[] {
  for (const key of ['data', 'results', 'records', 'facilities', 'campgrounds', 'items'] as const) {
    if (Array.isArray(page[key])) return page[key] as ReservationProviderRecord[];
  }
  return [];
}

export function getNextReservationProviderCursor(page: ReservationProviderPage): string | null {
  const nextCursor = firstText(page.nextCursor, page.next_cursor, page.cursor);
  const hasMore = page.hasMore === true || page.has_more === true;
  return hasMore && nextCursor ? nextCursor : null;
}

export function getNextReservationProviderOffset(page: ReservationProviderPage, offset: number): number | null {
  const currentCount = numberOrNull(page.limit) ?? getReservationProviderPageRecords(page).length;
  const totalCount = numberOrNull(page.total);
  if (currentCount <= 0) return null;
  const nextOffset = offset + currentCount;
  if (totalCount != null && nextOffset >= totalCount) return null;
  return nextOffset;
}

export function normalizeReservationProviderRecord(
  providerId: ReservationProviderId,
  record: ReservationProviderRecord,
  options: { attributionText?: string | null; syncedAt?: string } = {},
): NormalizedReservationCampground | null {
  const providerRecordId = firstText(
    record.id,
    record.facilityId,
    record.facility_id,
    record.campgroundId,
    record.campground_id,
    record.parkId,
    record.providerRecordId,
  );
  if (!providerRecordId) return null;

  const coordinates = readCoordinates(record);
  if (!coordinates) return null;

  const syncedAt = options.syncedAt ?? new Date().toISOString();
  const name = normalizeCampgroundName(record.name ?? record.facilityName ?? record.campgroundName ?? record.title);
  const reservationUrl = firstText(record.reservationUrl, record.reservation_url, record.bookingUrl, record.booking_url, record.reserveUrl);
  const detailUrl = firstText(record.detailUrl, record.detail_url, record.facilityUrl, record.url, reservationUrl);

  return {
    providerId,
    providerRecordId,
    normalizedName: normalizeReservationProviderMatchName(name),
    campground: {
      name,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      facility_type: normalizeSiteType(record.facilityType ?? record.FacilityType ?? record.type) === 'unknown'
        ? 'campground'
        : normalizeSiteType(record.facilityType ?? record.FacilityType ?? record.type),
      managing_agency: firstText(record.managingAgency, record.agency, record.operator, record.owner),
      managing_org: firstText(record.managingOrg, record.operatorName, record.operator, record.organization),
      reservation_url: reservationUrl,
      detail_url: detailUrl,
      status: normalizeCampgroundStatus(record.status ?? record.facilityStatus),
      availability_status: normalizeAvailabilityStatus(record.freshAvailabilityStatus) === 'unknown'
        ? 'unknown'
        : normalizeAvailabilityStatus(record.freshAvailabilityStatus),
      site_count: readSiteCount(record),
      site_types: normalizeSiteTypes(record),
      amenities: normalizeAmenities(record),
      source_confidence: SOURCE_CONFIDENCE[providerId],
      primary_provider: providerId,
      attribution: options.attributionText ?? providerId,
      last_synced_at: syncedAt,
      last_verified_at: null,
    },
    sourceRecord: {
      provider_id: providerId,
      provider_record_id: providerRecordId,
      source_url: detailUrl,
      raw_json: jsonValue(record),
      payload_hash: computePayloadHash(record),
      first_seen_at: syncedAt,
      last_seen_at: syncedAt,
    },
  };
}

export function selectBestReservationProviderMatch(
  normalized: NormalizedReservationCampground,
  candidates: ExistingCampgroundCandidate[],
): ExistingCampgroundCandidate | null {
  const targetName = normalized.normalizedName;
  const targetUrl = cleanText(normalized.campground.reservation_url ?? normalized.campground.detail_url);
  const target = {
    latitude: normalized.campground.latitude,
    longitude: normalized.campground.longitude,
  };

  const scored = candidates
    .map((candidate) => {
      const candidateName = normalizeReservationProviderMatchName(candidate.name);
      const candidateUrl = cleanText(candidate.reservation_url ?? candidate.detail_url);
      const urlMatch = Boolean(targetUrl && candidateUrl && (candidateUrl === targetUrl || candidateUrl.includes(targetUrl) || targetUrl.includes(candidateUrl)));
      const hasCoordinates = candidate.latitude != null && candidate.longitude != null;
      const miles = hasCoordinates
        ? distanceMiles(target, { latitude: Number(candidate.latitude), longitude: Number(candidate.longitude) })
        : Number.POSITIVE_INFINITY;
      const nameMatch = targetName.length > 0 && candidateName === targetName;
      const proximityMatch = hasCoordinates && miles <= MATCH_DISTANCE_MILES;
      const sourceBonus = candidate.primary_provider === 'ridb' || candidate.primary_provider === 'nps' ? 10 : 0;
      const score =
        (urlMatch ? 110 : 0) +
        (nameMatch ? 75 : 0) +
        (proximityMatch ? 35 : 0) +
        sourceBonus -
        (Number.isFinite(miles) ? Math.min(30, miles * 10) : 15);
      return { candidate, score, miles, nameMatch, proximityMatch, urlMatch };
    })
    .filter((row) => row.urlMatch || (row.nameMatch && row.proximityMatch))
    .sort((a, b) => b.score - a.score || a.miles - b.miles);

  return scored[0]?.candidate ?? null;
}

function mergeAttribution(existing: string | null | undefined, next: string | null | undefined): string | null {
  const existingText = cleanText(existing);
  const nextText = cleanText(next);
  if (!existingText) return nextText;
  if (!nextText || existingText.toLowerCase().includes(nextText.toLowerCase())) return existingText;
  return `${existingText}; ${nextText}`;
}

export function mergeReservationProviderIntoExistingCampground(
  existing: ExistingCampgroundCandidate,
  normalized: NormalizedReservationCampground,
  seenAt: string,
): CampgroundUpsertRow {
  const existingConfidence = Number(existing.source_confidence ?? 0);
  const keepExistingCoordinates = existingConfidence > normalized.campground.source_confidence;
  const existingReservation = cleanText(existing.reservation_url);
  const providerReservation = cleanText(normalized.campground.reservation_url);

  return {
    ...normalized.campground,
    latitude: keepExistingCoordinates && existing.latitude != null ? Number(existing.latitude) : normalized.campground.latitude,
    longitude: keepExistingCoordinates && existing.longitude != null ? Number(existing.longitude) : normalized.campground.longitude,
    reservation_url: existingReservation ?? providerReservation,
    detail_url: cleanText(existing.detail_url) ?? normalized.campground.detail_url,
    availability_status: 'unknown',
    source_confidence: Math.max(existingConfidence, normalized.campground.source_confidence),
    primary_provider: (existing.primary_provider as ProviderId | null) ?? normalized.campground.primary_provider,
    attribution: mergeAttribution(existing.attribution, normalized.campground.attribution),
    last_synced_at: seenAt,
  };
}

export function buildReservationProviderSyncRows(
  normalized: NormalizedReservationCampground,
  campgroundId: string,
  existingSource: ExistingReservationSourceRecord | null,
  seenAt: string,
): ReservationSyncRows {
  return {
    campground: {
      ...normalized.campground,
      last_synced_at: seenAt,
      availability_status: 'unknown',
    },
    sourceRecord: {
      ...normalized.sourceRecord,
      campground_id: campgroundId,
      first_seen_at: existingSource?.first_seen_at ?? normalized.sourceRecord.first_seen_at,
      last_seen_at: seenAt,
    },
  };
}

export function reservationProviderError(
  providerId: ReservationProviderId,
  status: number,
  body: unknown,
): { code: string; message: string } {
  const safe = safeProviderError(
    typeof body === 'object' && body !== null
      ? body
      : { message: typeof body === 'string' ? body : `${providerId} returned HTTP ${status}` },
  );
  const prefix = providerId.toUpperCase();
  if (status === 429) return { code: `${prefix}_RATE_LIMITED`, message: `${providerId} rate limit reached.` };
  if (status === 401 || status === 403) return { code: `${prefix}_AUTH_FAILED`, message: `${providerId} credentials rejected.` };
  return {
    code: `${prefix}_PROVIDER_ERROR`,
    message: safe.message || `${providerId} returned HTTP ${status}`,
  };
}

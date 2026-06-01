import {
  computePayloadHash,
  normalizeAvailabilityStatus,
  normalizeCampgroundName,
  safeProviderError,
  type CampgroundAvailabilityStatus,
  type JsonValue,
  type ProviderId,
} from '../../../lib/map/establishedCampgrounds.ts';

export type CampflareRecord = Record<string, unknown>;

export type CampflareApiPage = {
  data?: CampflareRecord[];
  campgrounds?: CampflareRecord[];
  results?: CampflareRecord[];
  records?: CampflareRecord[];
  nextCursor?: string | null;
  next_cursor?: string | null;
  cursor?: string | null;
  hasMore?: boolean;
  has_more?: boolean;
};

export type CampflareQuery = {
  baseUrl?: string;
  limit: number;
  cursor?: string | null;
  state?: string;
  updatedSince?: string;
};

export type CampgroundSourceRecordRow = {
  campground_id?: string | null;
  provider_id: 'campflare';
  provider_record_id: string;
  source_url: string | null;
  raw_json: JsonValue | null;
  payload_hash: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type CampgroundAvailabilityRow = {
  campground_id: string;
  provider_id: 'campflare';
  date: string | null;
  availability_status: CampgroundAvailabilityStatus;
  available_site_count: number | null;
  reservable: boolean | null;
  first_come_first_served: boolean | null;
  last_checked_at: string;
  expires_at: string | null;
};

export type NormalizedCampflareRecord = {
  providerRecordId: string;
  normalizedName: string;
  latitude: number | null;
  longitude: number | null;
  reservationUrl: string | null;
  sourceUrl: string | null;
  availabilityStatus: CampgroundAvailabilityStatus;
  availableSiteCount: number | null;
  reservable: boolean | null;
  firstComeFirstServed: boolean | null;
  lastCheckedAt: string;
  expiresAt: string | null;
  sourceRecord: CampgroundSourceRecordRow;
};

export type ExistingCampgroundCandidate = {
  id: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  reservation_url?: string | null;
  detail_url?: string | null;
  primary_provider?: ProviderId | string | null;
  attribution?: string | null;
  source_confidence?: number | null;
};

export type ExistingCampflareSourceRecord = {
  campground_id: string | null;
  first_seen_at: string | null;
};

const CAMPFLARE_PROVIDER_ID = 'campflare';
const DEFAULT_CAMPFLARE_BASE_URL = 'https://campflare.com/api';
const DEFAULT_TTL_SECONDS = 900;
const MATCH_DISTANCE_MILES = 0.4;

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

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    const text = cleanText(value)?.toLowerCase();
    if (text === 'true' || text === 'yes' || text === '1') return true;
    if (text === 'false' || text === 'no' || text === '0') return false;
  }
  return null;
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

export function normalizeCampflareMatchName(value: unknown): string {
  return normalizeCampgroundName(value)
    .toLowerCase()
    .replace(/\b(campground|campgrounds|camp|cg|rv park|rv)\b/g, '')
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

export function isCampflareAvailabilityFresh(record: Pick<NormalizedCampflareRecord, 'expiresAt' | 'lastCheckedAt'>, nowIso = new Date().toISOString()): boolean {
  const nowMs = new Date(nowIso).getTime();
  const expiresMs = record.expiresAt ? new Date(record.expiresAt).getTime() : NaN;
  const checkedMs = new Date(record.lastCheckedAt).getTime();
  if (Number.isFinite(expiresMs)) return expiresMs > nowMs;
  return Number.isFinite(checkedMs) && nowMs - checkedMs <= DEFAULT_TTL_SECONDS * 1000;
}

export function effectiveCampflareAvailabilityStatus(
  record: Pick<NormalizedCampflareRecord, 'availabilityStatus' | 'expiresAt' | 'lastCheckedAt'>,
  nowIso = new Date().toISOString(),
): CampgroundAvailabilityStatus {
  if (!isCampflareAvailabilityFresh(record, nowIso)) return 'unknown';
  return record.availabilityStatus;
}

export function buildCampflareAvailabilityUrl(query: CampflareQuery): string {
  const baseUrl = (query.baseUrl ?? DEFAULT_CAMPFLARE_BASE_URL).replace(/\/$/, '');
  const url = new URL(`${baseUrl}/campgrounds/availability`);
  url.searchParams.set('limit', String(Math.max(1, Math.min(query.limit, 100))));
  if (query.cursor) url.searchParams.set('cursor', query.cursor);
  if (query.state) url.searchParams.set('state', query.state.trim().toUpperCase());
  if (query.updatedSince) url.searchParams.set('updated_since', query.updatedSince);
  return url.toString();
}

export function getCampflarePageRecords(page: CampflareApiPage): CampflareRecord[] {
  for (const key of ['data', 'campgrounds', 'results', 'records'] as const) {
    if (Array.isArray(page[key])) return page[key] as CampflareRecord[];
  }
  return [];
}

export function getNextCampflareCursor(page: CampflareApiPage): string | null {
  const nextCursor = firstText(page.nextCursor, page.next_cursor, page.cursor);
  const hasMore = page.hasMore === true || page.has_more === true;
  return hasMore && nextCursor ? nextCursor : null;
}

export function normalizeCampflareRecord(
  record: CampflareRecord,
  options: { syncedAt?: string; ttlSeconds?: number } = {},
): NormalizedCampflareRecord | null {
  const providerRecordId = firstText(record.id, record.campgroundId, record.campground_id, record.facilityId, record.facility_id);
  if (!providerRecordId) return null;

  const name = normalizeCampgroundName(record.name ?? record.campgroundName ?? record.facilityName);
  const latitude = validLatitude(record.latitude ?? record.lat);
  const longitude = validLongitude(record.longitude ?? record.lng ?? record.lon);
  const lastCheckedAt = firstText(record.lastCheckedAt, record.last_checked_at, record.checkedAt, record.updatedAt) ?? options.syncedAt ?? new Date().toISOString();
  const explicitExpiresAt = firstText(record.expiresAt, record.expires_at);
  const expiresAt = explicitExpiresAt ?? addSeconds(lastCheckedAt, options.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const availableSiteCount = integerOrNull(record.availableSiteCount ?? record.available_sites ?? record.availableCount);
  const firstComeFirstServed = firstBoolean(record.firstComeFirstServed, record.first_come_first_served, record.ff);
  const reservable = firstBoolean(record.reservable, record.isReservable, record.reservationAvailable);
  let availabilityStatus = normalizeAvailabilityStatus(record.availabilityStatus ?? record.status ?? record.availability);

  if (availabilityStatus === 'unknown') {
    if (firstComeFirstServed === true) availabilityStatus = 'unknown';
    else if (availableSiteCount != null && availableSiteCount > 0) availabilityStatus = 'available';
    else if (availableSiteCount === 0) availabilityStatus = 'unavailable';
  }

  return {
    providerRecordId,
    normalizedName: normalizeCampflareMatchName(name),
    latitude,
    longitude,
    reservationUrl: firstText(record.reservationUrl, record.reservation_url, record.bookingUrl, record.booking_url),
    sourceUrl: firstText(record.sourceUrl, record.source_url, record.url),
    availabilityStatus,
    availableSiteCount,
    reservable,
    firstComeFirstServed,
    lastCheckedAt,
    expiresAt,
    sourceRecord: {
      provider_id: CAMPFLARE_PROVIDER_ID,
      provider_record_id: providerRecordId,
      source_url: firstText(record.sourceUrl, record.source_url, record.url),
      raw_json: jsonValue(record),
      payload_hash: computePayloadHash(record),
      first_seen_at: lastCheckedAt,
      last_seen_at: lastCheckedAt,
    },
  };
}

export function selectBestCampflareMatch(
  normalized: NormalizedCampflareRecord,
  candidates: ExistingCampgroundCandidate[],
): ExistingCampgroundCandidate | null {
  const targetName = normalized.normalizedName;
  const targetReservation = cleanText(normalized.reservationUrl ?? normalized.sourceUrl);

  const scored = candidates
    .map((candidate) => {
      const candidateName = normalizeCampflareMatchName(candidate.name);
      const nameMatch = targetName.length > 0 && candidateName === targetName;
      const candidateUrl = cleanText(candidate.reservation_url ?? candidate.detail_url);
      const urlMatch = Boolean(targetReservation && candidateUrl && (candidateUrl === targetReservation || candidateUrl.includes(targetReservation) || targetReservation.includes(candidateUrl)));
      const hasCoordinates = normalized.latitude != null && normalized.longitude != null && candidate.latitude != null && candidate.longitude != null;
      const miles = hasCoordinates
        ? distanceMiles(
            { latitude: Number(normalized.latitude), longitude: Number(normalized.longitude) },
            { latitude: Number(candidate.latitude), longitude: Number(candidate.longitude) },
          )
        : Number.POSITIVE_INFINITY;
      const proximityMatch = hasCoordinates && miles <= MATCH_DISTANCE_MILES;
      const providerBonus = candidate.primary_provider === 'ridb' || candidate.primary_provider === 'nps' ? 10 : 0;
      const score =
        (urlMatch ? 100 : 0) +
        (nameMatch ? 70 : 0) +
        (proximityMatch ? 35 : 0) +
        providerBonus -
        (Number.isFinite(miles) ? Math.min(30, miles * 10) : 15);
      return { candidate, score, nameMatch, urlMatch, proximityMatch, miles };
    })
    .filter((row) => row.urlMatch || (row.nameMatch && row.proximityMatch))
    .sort((a, b) => b.score - a.score || a.miles - b.miles);

  return scored[0]?.candidate ?? null;
}

export function buildCampflareAvailabilityRows(
  normalized: NormalizedCampflareRecord,
  campgroundId: string,
  nowIso = new Date().toISOString(),
): {
  sourceRecord: CampgroundSourceRecordRow & { campground_id: string };
  availability: CampgroundAvailabilityRow;
  canonicalAvailabilityStatus: CampgroundAvailabilityStatus;
  canonicalLastAvailabilityCheckedAt: string | null;
} {
  const canonicalAvailabilityStatus = effectiveCampflareAvailabilityStatus(normalized, nowIso);
  return {
    sourceRecord: {
      ...normalized.sourceRecord,
      campground_id: campgroundId,
      last_seen_at: normalized.lastCheckedAt,
    },
    availability: {
      campground_id: campgroundId,
      provider_id: CAMPFLARE_PROVIDER_ID,
      date: null,
      availability_status: canonicalAvailabilityStatus,
      available_site_count: canonicalAvailabilityStatus === 'unknown' ? null : normalized.availableSiteCount,
      reservable: normalized.reservable,
      first_come_first_served: normalized.firstComeFirstServed,
      last_checked_at: normalized.lastCheckedAt,
      expires_at: normalized.expiresAt,
    },
    canonicalAvailabilityStatus,
    canonicalLastAvailabilityCheckedAt: canonicalAvailabilityStatus === 'unknown' ? null : normalized.lastCheckedAt,
  };
}

export function campflareProviderError(status: number, body: unknown): { code: string; message: string } {
  const safe = safeProviderError(
    typeof body === 'object' && body !== null
      ? body
      : { message: typeof body === 'string' ? body : `Campflare returned HTTP ${status}` },
  );

  if (status === 429) return { code: 'CAMPFLARE_RATE_LIMITED', message: 'Campflare rate limit reached.' };
  if (status === 401 || status === 403) return { code: 'CAMPFLARE_AUTH_FAILED', message: 'Campflare credentials rejected.' };
  return {
    code: 'CAMPFLARE_PROVIDER_ERROR',
    message: safe.message || `Campflare returned HTTP ${status}`,
  };
}

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

export type NpsCampgroundRecord = Record<string, unknown>;
export type NpsParkRecord = Record<string, unknown>;
export type NpsAlertRecord = Record<string, unknown>;

export type NpsApiPage<T extends Record<string, unknown> = Record<string, unknown>> = {
  total?: string | number;
  limit?: string | number;
  start?: string | number;
  data?: T[];
};

export type NpsCampgroundsQuery = {
  baseUrl?: string;
  limit: number;
  start: number;
  parkCode?: string;
  stateCode?: string;
  query?: string;
};

export type NpsContext = {
  park?: NpsParkRecord | null;
  alerts?: NpsAlertRecord[];
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
  provider_id: 'nps';
  provider_record_id: string;
  source_url: string | null;
  raw_json: JsonValue | null;
  payload_hash: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type NormalizedNpsCampground = {
  providerRecordId: string;
  normalizedName: string;
  parkCode: string | null;
  campground: CampgroundUpsertRow;
  sourceRecord: SourceRecordUpsertRow;
};

export type ExistingNpsSourceRecord = {
  campground_id: string | null;
  first_seen_at: string | null;
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

export type NpsSyncRows = {
  campground: CampgroundUpsertRow;
  sourceRecord: SourceRecordUpsertRow & { campground_id: string };
};

const NPS_BASE_URL = 'https://developer.nps.gov/api/v1';
const NPS_PROVIDER_ID = 'nps';
const NPS_SOURCE_CONFIDENCE = 86;
const NPS_MATCH_DISTANCE_MILES = 0.35;

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

function parseLatLong(value: unknown): { latitude: number; longitude: number } | null {
  const text = cleanText(value);
  if (!text) return null;
  const latMatch = text.match(/lat\s*:\s*(-?\d+(?:\.\d+)?)/i);
  const lngMatch = text.match(/(?:long|lng)\s*:\s*(-?\d+(?:\.\d+)?)/i);
  const latitude = validLatitude(latMatch?.[1]);
  const longitude = validLongitude(lngMatch?.[1]);
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

function readCoordinates(record: NpsCampgroundRecord): { latitude: number; longitude: number } | null {
  const directLatitude = validLatitude(record.latitude ?? record.lat ?? record.Latitude);
  const directLongitude = validLongitude(record.longitude ?? record.lng ?? record.long ?? record.Longitude);
  if (directLatitude != null && directLongitude != null) {
    return { latitude: directLatitude, longitude: directLongitude };
  }
  return parseLatLong(record.latLong ?? record.latlong);
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function npsCampgroundUrl(providerRecordId: string): string {
  const url = new URL(`${NPS_BASE_URL}/campgrounds`);
  url.searchParams.set('id', providerRecordId);
  return url.toString();
}

function textFromObjectList(value: unknown, fields: string[]): string[] {
  return normalizeArray(value)
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      return fields.map((field) => cleanText((item as Record<string, unknown>)[field])).filter(Boolean) as string[];
    });
}

function normalizeNpsAmenities(record: NpsCampgroundRecord): string[] | null {
  const amenities = record.amenities;
  const candidates: string[] = [
    ...textFromObjectList(amenities, ['name', 'label', 'title']),
    ...textFromObjectList(record.accessibility, ['name', 'label', 'title']),
  ];

  if (amenities && typeof amenities === 'object' && !Array.isArray(amenities)) {
    for (const [key, value] of Object.entries(amenities as Record<string, unknown>)) {
      const readableKey = key.replace(/([a-z])([A-Z])/g, '$1 $2');
      if (value === true || value === 'Yes' || value === 'yes' || value === 'true') candidates.push(readableKey);
      if (typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'no') candidates.push(value);
    }
  }

  const description = cleanText(record.description);
  if (description) {
    if (/drinking water|potable water|\bwater\b/i.test(description)) candidates.push('water');
    if (/toilet|restroom/i.test(description)) candidates.push('toilets');
    if (/shower/i.test(description)) candidates.push('showers');
    if (/hookup|electric/i.test(description)) candidates.push('hookups');
    if (/dump station/i.test(description)) candidates.push('dump_station');
    if (/picnic table/i.test(description)) candidates.push('picnic_table');
    if (/fire ring|fire pit/i.test(description)) candidates.push('fire_ring');
    if (/trash|garbage/i.test(description)) candidates.push('trash');
  }

  const normalized = Array.from(
    new Set(candidates.map(normalizeAmenity).filter((amenity) => amenity !== 'unknown')),
  );
  return normalized.length > 0 ? normalized : null;
}

function normalizeNpsSiteTypes(record: NpsCampgroundRecord): string[] | null {
  const campsites = record.campsites;
  const candidates: string[] = [
    cleanText(record.campgroundType),
    cleanText(record.facilityType),
    ...textFromObjectList(campsites, ['type', 'name', 'label']),
  ].filter(Boolean) as string[];

  if (campsites && typeof campsites === 'object' && !Array.isArray(campsites)) {
    for (const [key, value] of Object.entries(campsites as Record<string, unknown>)) {
      if (Number(value) > 0) candidates.push(key);
    }
  }

  const normalized = Array.from(new Set(candidates.map(normalizeSiteType).filter((type) => type !== 'unknown')));
  return normalized.length > 0 ? normalized : ['campground'];
}

function readSiteCount(record: NpsCampgroundRecord): number | null {
  const direct = integerOrNull(record.totalSites ?? record.siteCount ?? record.numberOfSites);
  if (direct != null) return direct;

  const campsites = record.campsites;
  if (campsites && typeof campsites === 'object' && !Array.isArray(campsites)) {
    let total = 0;
    for (const value of Object.values(campsites as Record<string, unknown>)) {
      const count = integerOrNull(value);
      if (count != null) total += count;
    }
    return total > 0 ? total : null;
  }

  return null;
}

function buildNpsContext(context: NpsContext): JsonValue {
  const alerts = normalizeArray(context.alerts).map((alert) => ({
    id: cleanText((alert as Record<string, unknown>).id),
    title: cleanText((alert as Record<string, unknown>).title),
    category: cleanText((alert as Record<string, unknown>).category),
    url: cleanText((alert as Record<string, unknown>).url),
  }));

  return {
    park: context.park
      ? {
          id: cleanText(context.park.id),
          parkCode: cleanText(context.park.parkCode),
          fullName: cleanText(context.park.fullName),
          designation: cleanText(context.park.designation),
          url: cleanText(context.park.url),
        }
      : null,
    alerts,
  };
}

export function normalizeMatchName(value: unknown): string {
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

export function selectBestNpsCampgroundMatch(
  normalized: NormalizedNpsCampground,
  candidates: ExistingCampgroundCandidate[],
): ExistingCampgroundCandidate | null {
  const targetName = normalized.normalizedName;
  const target = {
    latitude: normalized.campground.latitude,
    longitude: normalized.campground.longitude,
  };

  const scored = candidates
    .filter((candidate) => candidate.id && candidate.latitude != null && candidate.longitude != null)
    .map((candidate) => {
      const candidateName = normalizeMatchName(candidate.name);
      const miles = distanceMiles(target, {
        latitude: Number(candidate.latitude),
        longitude: Number(candidate.longitude),
      });
      const nameMatch = targetName.length > 0 && candidateName === targetName;
      const npsAgencyMatch = String(candidate.managing_agency ?? candidate.managing_org ?? '')
        .toLowerCase()
        .includes('national park');
      const ridbProviderBonus = candidate.primary_provider === 'ridb' ? 10 : 0;
      const score =
        (nameMatch ? 80 : 0) +
        (miles <= NPS_MATCH_DISTANCE_MILES ? 40 : 0) +
        (npsAgencyMatch ? 10 : 0) +
        ridbProviderBonus -
        Math.min(30, miles * 10);
      return { candidate, miles, score, nameMatch };
    })
    .filter((row) => row.nameMatch && row.miles <= NPS_MATCH_DISTANCE_MILES && row.score >= 80)
    .sort((a, b) => b.score - a.score || a.miles - b.miles);

  return scored[0]?.candidate ?? null;
}

export function buildNpsCampgroundsUrl(query: NpsCampgroundsQuery): string {
  const baseUrl = (query.baseUrl ?? NPS_BASE_URL).replace(/\/$/, '');
  const url = new URL(`${baseUrl}/campgrounds`);
  url.searchParams.set('limit', String(Math.max(1, Math.min(query.limit, 50))));
  url.searchParams.set('start', String(Math.max(0, query.start)));
  if (query.parkCode) url.searchParams.set('parkCode', query.parkCode.trim().toLowerCase());
  if (query.stateCode) url.searchParams.set('stateCode', query.stateCode.trim().toUpperCase());
  if (query.query) url.searchParams.set('q', query.query.trim());
  return url.toString();
}

export function buildNpsParksUrl(parkCodes: string[], baseUrl = NPS_BASE_URL): string | null {
  const codes = Array.from(new Set(parkCodes.map((code) => code.trim().toLowerCase()).filter(Boolean)));
  if (!codes.length) return null;
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/parks`);
  url.searchParams.set('parkCode', codes.join(','));
  return url.toString();
}

export function buildNpsAlertsUrl(parkCodes: string[], baseUrl = NPS_BASE_URL): string | null {
  const codes = Array.from(new Set(parkCodes.map((code) => code.trim().toLowerCase()).filter(Boolean)));
  if (!codes.length) return null;
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/alerts`);
  url.searchParams.set('parkCode', codes.join(','));
  return url.toString();
}

export function getNpsPageRecords<T extends Record<string, unknown>>(page: NpsApiPage<T>): T[] {
  return Array.isArray(page.data) ? page.data : [];
}

export function getNextNpsStart<T extends Record<string, unknown>>(
  page: NpsApiPage<T>,
  start: number,
): number | null {
  const currentCount = numberOrNull(page.limit) ?? getNpsPageRecords(page).length;
  const totalCount = numberOrNull(page.total);
  if (currentCount <= 0) return null;
  const nextStart = start + currentCount;
  if (totalCount != null && nextStart >= totalCount) return null;
  return nextStart;
}

export function normalizeNpsCampgroundRecord(
  record: NpsCampgroundRecord,
  context: NpsContext = {},
  options: { attributionText?: string | null; syncedAt?: string } = {},
): NormalizedNpsCampground | null {
  const providerRecordId = firstText(record.id, record.idString, record.url);
  if (!providerRecordId) return null;

  const coordinates = readCoordinates(record);
  if (!coordinates) return null;

  const parkCode = firstText(record.parkCode, context.park?.parkCode);
  const syncedAt = options.syncedAt ?? new Date().toISOString();
  const rawJson = jsonValue({
    record,
    npsContext: buildNpsContext(context),
  });
  const parkFullName = firstText(context.park?.fullName);
  const parkUrl = firstText(context.park?.url);
  const reservationUrl = firstText(record.reservationUrl, record.reservationurl, record.url);
  const detailUrl = firstText(record.url, parkUrl, npsCampgroundUrl(providerRecordId));
  const status = normalizeCampgroundStatus(record.status);
  const availabilityStatus = normalizeAvailabilityStatus(record.availabilityStatus);
  const name = normalizeCampgroundName(record.name ?? record.title);

  return {
    providerRecordId,
    normalizedName: normalizeMatchName(name),
    parkCode,
    campground: {
      name,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      facility_type: 'campground',
      managing_agency: 'National Park Service',
      managing_org: parkFullName ?? firstText(record.organization, record.managingOrg) ?? 'National Park Service',
      reservation_url: reservationUrl,
      detail_url: detailUrl,
      status,
      availability_status: availabilityStatus,
      site_count: readSiteCount(record),
      site_types: normalizeNpsSiteTypes(record),
      amenities: normalizeNpsAmenities(record),
      source_confidence: NPS_SOURCE_CONFIDENCE,
      primary_provider: NPS_PROVIDER_ID,
      attribution: options.attributionText ?? 'National Park Service',
      last_synced_at: syncedAt,
      last_verified_at: null,
    },
    sourceRecord: {
      provider_id: NPS_PROVIDER_ID,
      provider_record_id: providerRecordId,
      source_url: detailUrl,
      raw_json: rawJson,
      payload_hash: computePayloadHash({ record, park: context.park ?? null, alerts: context.alerts ?? [] }),
      first_seen_at: syncedAt,
      last_seen_at: syncedAt,
    },
  };
}

export function mergeNpsIntoExistingCampground(
  existing: ExistingCampgroundCandidate,
  normalized: NormalizedNpsCampground,
  seenAt: string,
): CampgroundUpsertRow {
  const existingConfidence = Number(existing.source_confidence ?? 0);
  const keepExistingCoordinates = existingConfidence > normalized.campground.source_confidence;
  const existingReservation = cleanText(existing.reservation_url);
  const npsReservation = cleanText(normalized.campground.reservation_url);
  const existingAttribution = cleanText(existing.attribution);
  const npsAttribution = cleanText(normalized.campground.attribution);

  return {
    ...normalized.campground,
    latitude: keepExistingCoordinates && existing.latitude != null ? Number(existing.latitude) : normalized.campground.latitude,
    longitude: keepExistingCoordinates && existing.longitude != null ? Number(existing.longitude) : normalized.campground.longitude,
    reservation_url: existingReservation ?? npsReservation,
    detail_url: cleanText(existing.detail_url) ?? normalized.campground.detail_url,
    source_confidence: Math.max(existingConfidence, normalized.campground.source_confidence),
    primary_provider: (existing.primary_provider as ProviderId | null) ?? normalized.campground.primary_provider,
    attribution:
      existingAttribution && npsAttribution && !existingAttribution.includes(npsAttribution)
        ? `${existingAttribution}; ${npsAttribution}`
        : existingAttribution ?? npsAttribution,
    last_synced_at: seenAt,
  };
}

export function buildNpsSyncRows(
  normalized: NormalizedNpsCampground,
  campgroundId: string,
  existingSource: ExistingNpsSourceRecord | null,
  seenAt: string,
): NpsSyncRows {
  return {
    campground: {
      ...normalized.campground,
      last_synced_at: seenAt,
    },
    sourceRecord: {
      ...normalized.sourceRecord,
      campground_id: campgroundId,
      first_seen_at: existingSource?.first_seen_at ?? normalized.sourceRecord.first_seen_at,
      last_seen_at: seenAt,
    },
  };
}

export function npsProviderError(status: number, body: unknown): { code: string; message: string } {
  const safe = safeProviderError(
    typeof body === 'object' && body !== null
      ? body
      : { message: typeof body === 'string' ? body : `NPS returned HTTP ${status}` },
  );

  if (status === 429) return { code: 'NPS_RATE_LIMITED', message: 'NPS rate limit reached.' };
  if (status === 401 || status === 403) return { code: 'NPS_AUTH_FAILED', message: 'NPS credentials rejected.' };
  return {
    code: 'NPS_PROVIDER_ERROR',
    message: safe.message || `NPS returned HTTP ${status}`,
  };
}

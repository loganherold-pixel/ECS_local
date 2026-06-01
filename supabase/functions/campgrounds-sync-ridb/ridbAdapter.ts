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
} from '../../../lib/map/establishedCampgrounds.ts';

export type RidbFacilityRecord = Record<string, unknown>;

export type RidbFacilitiesPage = {
  RECDATA?: RidbFacilityRecord[];
  METADATA?: {
    RESULTS?: {
      CURRENT_COUNT?: number;
      TOTAL_COUNT?: number;
    };
  };
};

export type RidbFacilitiesQuery = {
  baseUrl?: string;
  limit: number;
  offset: number;
  query?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
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
  primary_provider: 'ridb';
  attribution: string | null;
  last_synced_at: string;
  last_verified_at: string | null;
};

export type SourceRecordUpsertRow = {
  campground_id?: string;
  provider_id: 'ridb';
  provider_record_id: string;
  source_url: string | null;
  raw_json: JsonValue | null;
  payload_hash: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type NormalizedRidbCampground = {
  providerRecordId: string;
  campground: CampgroundUpsertRow;
  sourceRecord: SourceRecordUpsertRow;
};

export type ExistingRidbSourceRecord = {
  campground_id: string | null;
  first_seen_at: string | null;
};

export type RidbSyncRows = {
  campground: CampgroundUpsertRow;
  sourceRecord: SourceRecordUpsertRow & { campground_id: string };
};

const RIDB_BASE_URL = 'https://ridb.recreation.gov/api/v1';
const RIDB_PROVIDER_ID = 'ridb';
const RIDB_SOURCE_CONFIDENCE = 92;

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

function collectAmenityCandidates(record: RidbFacilityRecord): string[] {
  const candidates: string[] = [];
  const directFields = [
    record.FacilityAdaAccess,
    record.FacilityUseFeeDescription,
    record.FacilityDescription,
    record.Keywords,
  ];

  for (const field of directFields) {
    const text = cleanText(field);
    if (text) candidates.push(text);
  }

  const attributes = record.ATTRIBUTES ?? record.Attributes ?? record.attributes;
  if (Array.isArray(attributes)) {
    for (const attribute of attributes) {
      if (!attribute || typeof attribute !== 'object') continue;
      const row = attribute as Record<string, unknown>;
      const name = cleanText(row.AttributeName ?? row.name ?? row.Name);
      const value = cleanText(row.AttributeValue ?? row.value ?? row.Value);
      if (name) candidates.push(name);
      if (value && value.toLowerCase() !== 'false' && value.toLowerCase() !== 'no') candidates.push(value);
    }
  }

  return Array.from(new Set(candidates.flatMap((candidate) => {
    const pieces = candidate
      .split(/[;,|]/g)
      .map((piece) => piece.trim())
      .filter(Boolean);
    return pieces.length > 0 ? pieces : [candidate];
  })));
}

function normalizeRidbAmenities(record: RidbFacilityRecord): string[] | null {
  const amenities = Array.from(
    new Set(
      collectAmenityCandidates(record)
        .map(normalizeAmenity)
        .filter((amenity) => amenity !== 'unknown'),
    ),
  );
  return amenities.length > 0 ? amenities : null;
}

function normalizeRidbSiteTypes(record: RidbFacilityRecord): string[] | null {
  const candidates = [
    record.FacilityTypeDescription,
    record.FacilityType,
    record.EntityType,
    record.CampsiteType,
  ];

  const siteTypes = Array.from(
    new Set(
      candidates
        .map(normalizeSiteType)
        .filter((siteType) => siteType !== 'unknown'),
    ),
  );

  return siteTypes.length > 0 ? siteTypes : ['campground'];
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function ridbFacilitySourceUrl(providerRecordId: string): string {
  return `${RIDB_BASE_URL}/facilities/${encodeURIComponent(providerRecordId)}`;
}

export function buildRidbFacilitiesUrl(query: RidbFacilitiesQuery): string {
  const baseUrl = (query.baseUrl ?? RIDB_BASE_URL).replace(/\/$/, '');
  const url = new URL(`${baseUrl}/facilities`);
  url.searchParams.set('limit', String(Math.max(1, Math.min(query.limit, 50))));
  url.searchParams.set('offset', String(Math.max(0, query.offset)));
  url.searchParams.set('full', 'true');
  url.searchParams.set('query', query.query?.trim() || 'campground');

  if (query.state) url.searchParams.set('state', query.state.trim().toUpperCase());
  if (Number.isFinite(query.latitude)) url.searchParams.set('latitude', String(query.latitude));
  if (Number.isFinite(query.longitude)) url.searchParams.set('longitude', String(query.longitude));
  if (Number.isFinite(query.radius)) url.searchParams.set('radius', String(query.radius));

  return url.toString();
}

export function getRidbPageRecords(page: RidbFacilitiesPage): RidbFacilityRecord[] {
  return Array.isArray(page.RECDATA) ? page.RECDATA : [];
}

export function getNextRidbOffset(page: RidbFacilitiesPage, offset: number, limit: number): number | null {
  const currentCount = numberOrNull(page.METADATA?.RESULTS?.CURRENT_COUNT) ?? getRidbPageRecords(page).length;
  const totalCount = numberOrNull(page.METADATA?.RESULTS?.TOTAL_COUNT);
  void limit;
  if (currentCount <= 0) return null;
  const nextOffset = offset + currentCount;
  if (totalCount != null && nextOffset >= totalCount) return null;
  return nextOffset;
}

export function normalizeRidbFacilityRecord(
  record: RidbFacilityRecord,
  options: { attributionText?: string | null; syncedAt?: string } = {},
): NormalizedRidbCampground | null {
  const providerRecordId = firstText(record.FacilityID, record.facility_id, record.id);
  if (!providerRecordId) return null;

  const latitude = validLatitude(record.FacilityLatitude ?? record.latitude ?? record.Latitude);
  const longitude = validLongitude(record.FacilityLongitude ?? record.longitude ?? record.Longitude);
  if (latitude == null || longitude == null) return null;

  const facilityType = normalizeSiteType(record.FacilityTypeDescription ?? record.FacilityType);
  const syncedAt = options.syncedAt ?? new Date().toISOString();
  const status = normalizeCampgroundStatus(record.FacilityStatus ?? record.Status ?? record.status);
  const availabilityStatus = normalizeAvailabilityStatus(record.AvailabilityStatus ?? record.availability_status);
  const sourceUrl = ridbFacilitySourceUrl(providerRecordId);
  const rawJson = jsonValue(record);

  return {
    providerRecordId,
    campground: {
      name: normalizeCampgroundName(record.FacilityName ?? record.name),
      latitude,
      longitude,
      facility_type: facilityType === 'unknown' ? 'campground' : facilityType,
      managing_agency: firstText(record.OrgName, record.ParentOrgName, record.ManagingAgency),
      managing_org: firstText(record.OrgName, record.ManagingOrg, record.ParentOrgName),
      reservation_url: firstText(record.FacilityReservationURL, record.ReservationURL, record.reservation_url),
      detail_url: firstText(record.FacilityURL, record.FacilityMapURL, sourceUrl),
      status,
      availability_status: availabilityStatus,
      site_count: integerOrNull(record.CampsiteTotal ?? record.TotalSites ?? record.SiteCount),
      site_types: normalizeRidbSiteTypes(record),
      amenities: normalizeRidbAmenities(record),
      source_confidence: RIDB_SOURCE_CONFIDENCE,
      primary_provider: RIDB_PROVIDER_ID,
      attribution: options.attributionText ?? 'RIDB / Recreation.gov',
      last_synced_at: syncedAt,
      last_verified_at: null,
    },
    sourceRecord: {
      provider_id: RIDB_PROVIDER_ID,
      provider_record_id: providerRecordId,
      source_url: sourceUrl,
      raw_json: rawJson,
      payload_hash: computePayloadHash(record),
      first_seen_at: syncedAt,
      last_seen_at: syncedAt,
    },
  };
}

export function dedupeRidbRecords(records: RidbFacilityRecord[]): RidbFacilityRecord[] {
  const byProviderId = new Map<string, RidbFacilityRecord>();
  for (const record of records) {
    const providerRecordId = firstText(record.FacilityID, record.facility_id, record.id);
    if (!providerRecordId) continue;
    byProviderId.set(providerRecordId, record);
  }
  return Array.from(byProviderId.values());
}

export function buildRidbSyncRows(
  normalized: NormalizedRidbCampground,
  campgroundId: string,
  existingSource: ExistingRidbSourceRecord | null,
  seenAt: string,
): RidbSyncRows {
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

export function ridbProviderError(status: number, body: unknown): { code: string; message: string } {
  const safe = safeProviderError(
    typeof body === 'object' && body !== null
      ? body
      : { message: typeof body === 'string' ? body : `RIDB returned HTTP ${status}` },
  );

  if (status === 429) return { code: 'RIDB_RATE_LIMITED', message: 'RIDB rate limit reached.' };
  if (status === 401 || status === 403) return { code: 'RIDB_AUTH_FAILED', message: 'RIDB credentials rejected.' };
  return {
    code: 'RIDB_PROVIDER_ERROR',
    message: safe.message || `RIDB returned HTTP ${status}`,
  };
}

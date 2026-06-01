import {
  computePayloadHash,
  normalizeAmenity,
  normalizeCampgroundName,
  safeProviderError,
  type CampgroundAvailabilityStatus,
  type CampgroundStatus,
  type JsonValue,
  type ProviderId,
} from '../../../lib/map/establishedCampgrounds.ts';

export type OsmElementType = 'node' | 'way' | 'relation';

export type OsmElement = {
  type: OsmElementType;
  id: number | string;
  lat?: number | string;
  lon?: number | string;
  center?: {
    lat?: number | string;
    lon?: number | string;
  };
  tags?: Record<string, unknown>;
};

export type OsmOverpassResponse = {
  elements?: OsmElement[];
  remark?: string;
};

export type OsmBbox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
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
  provider_id: 'osm';
  provider_record_id: string;
  source_url: string | null;
  raw_json: JsonValue | null;
  payload_hash: string;
  first_seen_at: string;
  last_seen_at: string;
};

export type NormalizedOsmCampground = {
  providerRecordId: string;
  normalizedName: string;
  elementType: OsmElementType;
  campground: CampgroundUpsertRow;
  sourceRecord: SourceRecordUpsertRow;
};

export type ExistingCampgroundCandidate = {
  id: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  facility_type?: string | null;
  managing_agency?: string | null;
  managing_org?: string | null;
  reservation_url?: string | null;
  detail_url?: string | null;
  status?: CampgroundStatus | string | null;
  availability_status?: CampgroundAvailabilityStatus | string | null;
  site_count?: number | null;
  site_types?: string[] | null;
  amenities?: string[] | null;
  primary_provider?: ProviderId | string | null;
  source_confidence?: number | null;
  attribution?: string | null;
};

export type ExistingOsmSourceRecord = {
  campground_id: string | null;
  first_seen_at: string | null;
};

export type OsmSyncRows = {
  campground: CampgroundUpsertRow;
  sourceRecord: SourceRecordUpsertRow & { campground_id: string };
};

const OSM_PROVIDER_ID = 'osm';
const OSM_SOURCE_CONFIDENCE = 58;
const OSM_MATCH_DISTANCE_MILES = 0.25;
const MAX_BBOX_AREA_SQUARE_DEGREES = 4;

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

function tag(element: OsmElement, key: string): unknown {
  return element.tags?.[key];
}

function elementCoordinates(element: OsmElement): { latitude: number; longitude: number } | null {
  const latitude = validLatitude(element.lat ?? element.center?.lat);
  const longitude = validLongitude(element.lon ?? element.center?.lon);
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

function osmSourceUrl(element: Pick<OsmElement, 'type' | 'id'>): string {
  return `https://www.openstreetmap.org/${element.type}/${encodeURIComponent(String(element.id))}`;
}

function normalizeTourismType(value: unknown): string {
  const tourism = cleanText(value)?.toLowerCase().replace(/-/g, '_');
  if (tourism === 'camp_pitch') return 'tent_site';
  if (tourism === 'caravan_site') return 'rv_park';
  return 'campground';
}

function normalizeOsmAmenities(element: OsmElement): string[] | null {
  const candidates: string[] = [];
  const tags = element.tags ?? {};

  if (tags.toilets === 'yes' || tags.amenity === 'toilets') candidates.push('toilets');
  if (tags.shower === 'yes' || tags.showers === 'yes') candidates.push('showers');
  if (tags.drinking_water === 'yes' || tags.water_point === 'yes') candidates.push('water');
  if (tags.picnic_table === 'yes') candidates.push('picnic_table');
  if (tags.firepit === 'yes' || tags.fire_ring === 'yes') candidates.push('fire_ring');
  if (tags.waste_disposal === 'yes' || tags.trash === 'yes') candidates.push('trash');
  if (tags.sanitary_dump_station === 'yes') candidates.push('dump_station');
  if (tags.power_supply === 'yes' || tags.electricity === 'yes') candidates.push('hookups');

  const normalized = Array.from(new Set(candidates.map(normalizeAmenity).filter((amenity) => amenity !== 'unknown')));
  return normalized.length > 0 ? normalized : null;
}

export function normalizeOsmMatchName(value: unknown): string {
  return normalizeCampgroundName(value)
    .toLowerCase()
    .replace(/\b(campground|campgrounds|camp|cg|rv park|rv resort|camping|camp site)\b/g, '')
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

export function validateOsmBbox(input: Partial<OsmBbox>): OsmBbox | null {
  const minLat = validLatitude(input.minLat);
  const maxLat = validLatitude(input.maxLat);
  const minLng = validLongitude(input.minLng);
  const maxLng = validLongitude(input.maxLng);
  if (minLat == null || maxLat == null || minLng == null || maxLng == null) return null;
  const south = Math.min(minLat, maxLat);
  const north = Math.max(minLat, maxLat);
  const west = Math.min(minLng, maxLng);
  const east = Math.max(minLng, maxLng);
  const area = (north - south) * (east - west);
  if (area <= 0 || area > MAX_BBOX_AREA_SQUARE_DEGREES) return null;
  return { minLat: south, minLng: west, maxLat: north, maxLng: east };
}

export function buildOsmOverpassQuery(bbox: OsmBbox): string {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const box = `${minLat},${minLng},${maxLat},${maxLng}`;
  return [
    '[out:json][timeout:25];',
    '(',
    `node["tourism"~"^(camp_site|camp_pitch)$"](${box});`,
    `way["tourism"~"^(camp_site|camp_pitch)$"](${box});`,
    `relation["tourism"~"^(camp_site|camp_pitch)$"](${box});`,
    ');',
    'out center tags;',
  ].join('\n');
}

export function getOsmElements(response: OsmOverpassResponse): OsmElement[] {
  return Array.isArray(response.elements) ? response.elements : [];
}

export function normalizeOsmElement(
  element: OsmElement,
  options: { attributionText?: string | null; syncedAt?: string } = {},
): NormalizedOsmCampground | null {
  if (!element?.type || element.id == null) return null;
  if (!['node', 'way', 'relation'].includes(element.type)) return null;
  const coordinates = elementCoordinates(element);
  if (!coordinates) return null;

  const tourism = tag(element, 'tourism');
  const tourismText = cleanText(tourism)?.toLowerCase();
  if (tourismText !== 'camp_site' && tourismText !== 'camp_pitch') return null;

  const syncedAt = options.syncedAt ?? new Date().toISOString();
  const providerRecordId = `${element.type}/${element.id}`;
  const website = firstText(tag(element, 'website'), tag(element, 'contact:website'), tag(element, 'url'));
  const name = normalizeCampgroundName(tag(element, 'name') ?? tag(element, 'official_name'));
  const siteCount = integerOrNull(tag(element, 'capacity') ?? tag(element, 'capacity:persons') ?? tag(element, 'capacity:pitches'));
  const facilityType = normalizeTourismType(tourism);
  const sourceUrl = osmSourceUrl(element);

  return {
    providerRecordId,
    normalizedName: normalizeOsmMatchName(name),
    elementType: element.type,
    campground: {
      name,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      facility_type: facilityType,
      managing_agency: firstText(tag(element, 'operator'), tag(element, 'owner')),
      managing_org: firstText(tag(element, 'operator'), tag(element, 'owner')),
      reservation_url: null,
      detail_url: website,
      status: 'unknown',
      availability_status: 'unknown',
      site_count: siteCount,
      site_types: [facilityType],
      amenities: normalizeOsmAmenities(element),
      source_confidence: OSM_SOURCE_CONFIDENCE,
      primary_provider: OSM_PROVIDER_ID,
      attribution: options.attributionText ?? 'OpenStreetMap contributors',
      last_synced_at: syncedAt,
      last_verified_at: null,
    },
    sourceRecord: {
      provider_id: OSM_PROVIDER_ID,
      provider_record_id: providerRecordId,
      source_url: sourceUrl,
      raw_json: jsonValue(element),
      payload_hash: computePayloadHash(element),
      first_seen_at: syncedAt,
      last_seen_at: syncedAt,
    },
  };
}

export function selectBestOsmCampgroundMatch(
  normalized: NormalizedOsmCampground,
  candidates: ExistingCampgroundCandidate[],
): ExistingCampgroundCandidate | null {
  const targetName = normalized.normalizedName;
  const targetUrl = cleanText(normalized.campground.detail_url);
  const target = {
    latitude: normalized.campground.latitude,
    longitude: normalized.campground.longitude,
  };

  const scored = candidates
    .map((candidate) => {
      const candidateName = normalizeOsmMatchName(candidate.name);
      const candidateUrl = cleanText(candidate.detail_url ?? candidate.reservation_url);
      const urlMatch = Boolean(targetUrl && candidateUrl && (candidateUrl === targetUrl || candidateUrl.includes(targetUrl) || targetUrl.includes(candidateUrl)));
      const hasCoordinates = candidate.latitude != null && candidate.longitude != null;
      const miles = hasCoordinates
        ? distanceMiles(target, { latitude: Number(candidate.latitude), longitude: Number(candidate.longitude) })
        : Number.POSITIVE_INFINITY;
      const nameMatch = targetName.length > 0 && candidateName === targetName;
      const proximityMatch = hasCoordinates && miles <= OSM_MATCH_DISTANCE_MILES;
      const sourceBonus = candidate.primary_provider === 'ridb' || candidate.primary_provider === 'nps' ? 15 : 0;
      const score =
        (urlMatch ? 100 : 0) +
        (nameMatch ? 70 : 0) +
        (proximityMatch ? 40 : 0) +
        sourceBonus -
        (Number.isFinite(miles) ? Math.min(30, miles * 15) : 15);
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

export function mergeOsmIntoExistingCampground(
  existing: ExistingCampgroundCandidate,
  normalized: NormalizedOsmCampground,
  seenAt: string,
): CampgroundUpsertRow {
  const existingConfidence = Number(existing.source_confidence ?? 0);
  const keepExistingCoordinates = existingConfidence > normalized.campground.source_confidence;

  return {
    ...normalized.campground,
    name: cleanText(existing.name) ?? normalized.campground.name,
    latitude: keepExistingCoordinates && existing.latitude != null ? Number(existing.latitude) : normalized.campground.latitude,
    longitude: keepExistingCoordinates && existing.longitude != null ? Number(existing.longitude) : normalized.campground.longitude,
    facility_type: cleanText(existing.facility_type) ?? normalized.campground.facility_type,
    managing_agency: cleanText(existing.managing_agency) ?? normalized.campground.managing_agency,
    managing_org: cleanText(existing.managing_org) ?? normalized.campground.managing_org,
    reservation_url: cleanText(existing.reservation_url),
    detail_url: cleanText(existing.detail_url) ?? normalized.campground.detail_url,
    status: (cleanText(existing.status) as CampgroundStatus | null) ?? 'unknown',
    availability_status: (cleanText(existing.availability_status) as CampgroundAvailabilityStatus | null) ?? 'unknown',
    site_count: existing.site_count ?? normalized.campground.site_count,
    site_types: existing.site_types ?? normalized.campground.site_types,
    amenities: existing.amenities ?? normalized.campground.amenities,
    source_confidence: Math.max(existingConfidence, normalized.campground.source_confidence),
    primary_provider: (existing.primary_provider as ProviderId | null) ?? normalized.campground.primary_provider,
    attribution: mergeAttribution(existing.attribution, normalized.campground.attribution),
    last_synced_at: seenAt,
  };
}

export function buildOsmSyncRows(
  normalized: NormalizedOsmCampground,
  campgroundId: string,
  existingSource: ExistingOsmSourceRecord | null,
  seenAt: string,
): OsmSyncRows {
  return {
    campground: {
      ...normalized.campground,
      last_synced_at: seenAt,
      status: 'unknown',
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

export function osmProviderError(status: number, body: unknown): { code: string; message: string } {
  const safe = safeProviderError(
    typeof body === 'object' && body !== null
      ? body
      : { message: typeof body === 'string' ? body : `OpenStreetMap/Overpass returned HTTP ${status}` },
  );
  if (status === 429 || status === 504) return { code: 'OSM_RATE_LIMITED', message: 'OpenStreetMap Overpass rate limit or timeout reached.' };
  return {
    code: 'OSM_PROVIDER_ERROR',
    message: safe.message || `OpenStreetMap/Overpass returned HTTP ${status}`,
  };
}

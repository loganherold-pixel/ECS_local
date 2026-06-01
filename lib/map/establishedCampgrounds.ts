export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ProviderId =
  | 'ridb'
  | 'nps'
  | 'campflare'
  | 'active'
  | 'reserveamerica'
  | 'aspira'
  | 'osm'
  | 'manual';

export type CampgroundStatus =
  | 'unknown'
  | 'open'
  | 'closed'
  | 'seasonal'
  | 'temporarily_closed'
  | 'removed'
  | 'verify';

export type CampgroundAvailabilityStatus =
  | 'unknown'
  | 'available'
  | 'limited'
  | 'unavailable'
  | 'closed'
  | 'stale';

export type EstablishedCampground = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
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
  primaryProvider: ProviderId | null;
  attribution: string | null;
  lastSyncedAt: string | null;
  lastAvailabilityCheckedAt?: string | null;
  lastVerifiedAt: string | null;
  sources: CampgroundSourceRecord[];
};

export type CampgroundSourceRecord = {
  providerId: ProviderId;
  providerRecordId: string;
  sourceUrl: string | null;
  rawJson: JsonValue | null;
  payloadHash: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type CampgroundAvailability = {
  campgroundId: string;
  providerId: ProviderId;
  date: string | null;
  availabilityStatus: CampgroundAvailabilityStatus;
  availableSiteCount: number | null;
  reservable: boolean | null;
  firstComeFirstServed: boolean | null;
  lastCheckedAt: string;
  expiresAt: string | null;
};

export type EstablishedCampgroundMapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle: string;
  type: 'established_campground';
  category: 'campground';
  availabilityStatus: CampgroundAvailabilityStatus;
  sourceConfidence: number;
  attribution: string | null;
};

export type SafeProviderError = {
  message: string;
  name?: string;
  code?: string;
};

const SECRET_VALUE_PATTERNS = [
  /([?&](?:api[_-]?key|key|token|secret|access_token|client_secret)=)[^&\s]+/gi,
  /(bearer\s+)[a-z0-9._~+/=-]+/gi,
  /(service[_-]?role[_-]?key["'\s:=]+)[a-z0-9._~+/=-]+/gi,
  /(apikey["'\s:=]+)[a-z0-9._~+/=-]+/gi,
  /(authorization["'\s:=]+)[a-z0-9._~+/=-]+/gi,
];

const SECRET_ENV_REF_PATTERN =
  /\b(?:[A-Z][A-Z0-9]*_)+(?:API_KEY|API_SECRET|SERVICE_ROLE_KEY|USER_AGENT|ATTRIBUTION)\b/g;

function normalizeLooseText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeToken(value: unknown): string {
  return normalizeLooseText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeCampgroundName(name: unknown): string {
  const normalized = normalizeLooseText(name);
  return normalized.length > 0 ? normalized : 'Unknown campground';
}

export function normalizeAmenity(value: unknown): string {
  const token = normalizeToken(value);
  if (!token) return 'unknown';

  if (['water', 'drinking_water', 'potable_water'].includes(token)) return 'water';
  if (['toilet', 'toilets', 'restroom', 'restrooms', 'vault_toilet', 'pit_toilet'].includes(token)) {
    return 'toilets';
  }
  if (['shower', 'showers'].includes(token)) return 'showers';
  if (['hookup', 'hookups', 'rv_hookups', 'electric_hookup', 'electricity'].includes(token)) {
    return 'hookups';
  }
  if (['dump_station', 'sanitary_dump', 'rv_dump'].includes(token)) return 'dump_station';
  if (['picnic_table', 'picnic_tables', 'table', 'tables'].includes(token)) return 'picnic_table';
  if (['fire_ring', 'fire_rings', 'fire_pit', 'firepit'].includes(token)) return 'fire_ring';
  if (['trash', 'garbage', 'refuse'].includes(token)) return 'trash';
  if (['camp_host', 'host'].includes(token)) return 'camp_host';
  if (['store', 'camp_store', 'general_store'].includes(token)) return 'store';
  if (['cell_service', 'cellular', 'mobile_service'].includes(token)) return 'cell_service';

  return token || 'unknown';
}

export function normalizeSiteType(value: unknown): string {
  const token = normalizeToken(value);
  if (!token) return 'unknown';

  if (['campground', 'camp_site', 'campsite', 'standard'].includes(token)) return 'campground';
  if (['rv', 'rv_park', 'caravan_site', 'recreational_vehicle'].includes(token)) return 'rv_park';
  if (['tent', 'tent_site', 'tent_only'].includes(token)) return 'tent_site';
  if (['group', 'group_site', 'group_campground'].includes(token)) return 'group_site';
  if (['cabin', 'cabins', 'yurt', 'lodging'].includes(token)) return 'cabin';
  if (['primitive', 'primitive_developed', 'developed_primitive'].includes(token)) {
    return 'primitive_developed';
  }

  return 'unknown';
}

export function normalizeCampgroundStatus(value: unknown): CampgroundStatus {
  const token = normalizeToken(value);
  if (['open', 'active', 'operating'].includes(token)) return 'open';
  if (['closed', 'inactive'].includes(token)) return 'closed';
  if (['seasonal', 'seasonally_open', 'seasonal_closure'].includes(token)) return 'seasonal';
  if (['temporarily_closed', 'temporary_closure', 'temp_closed'].includes(token)) {
    return 'temporarily_closed';
  }
  if (['removed', 'deleted', 'retired'].includes(token)) return 'removed';
  if (['verify', 'verify_locally', 'needs_verification'].includes(token)) return 'verify';
  return 'unknown';
}

export function normalizeAvailabilityStatus(value: unknown): CampgroundAvailabilityStatus {
  const token = normalizeToken(value);
  if (['available', 'available_now', 'available_tonight', 'opening', 'cancellation', 'open_available'].includes(token)) {
    return 'available';
  }
  if (['limited', 'few_available', 'low_availability'].includes(token)) return 'limited';
  if (['unavailable', 'full', 'sold_out', 'no_availability'].includes(token)) return 'unavailable';
  if (['closed', 'not_open'].includes(token)) return 'closed';
  if (['stale', 'expired', 'cached'].includes(token)) return 'stale';
  return 'unknown';
}

export function buildCampgroundMarker(campground: EstablishedCampground): EstablishedCampgroundMapMarker {
  const provider = campground.primaryProvider ? campground.primaryProvider.toUpperCase() : 'UNKNOWN';
  const availability = campground.availabilityStatus === 'unknown'
    ? 'availability unknown'
    : campground.availabilityStatus.replace(/_/g, ' ');

  return {
    id: campground.id,
    latitude: campground.latitude,
    longitude: campground.longitude,
    title: normalizeCampgroundName(campground.name),
    subtitle: `${provider} · ${availability}`,
    type: 'established_campground',
    category: 'campground',
    availabilityStatus: campground.availabilityStatus,
    sourceConfidence: Math.max(0, Math.min(100, Number(campground.sourceConfidence) || 0)),
    attribution: campground.attribution,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(',')}}`;
}

export function computePayloadHash(payload: unknown): string {
  const stablePayload = stableStringify(payload);
  let hash = 0x811c9dc5;

  for (let index = 0; index < stablePayload.length; index += 1) {
    hash ^= stablePayload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function redactSensitiveText(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, '$1[redacted]');
  }
  redacted = redacted.replace(SECRET_ENV_REF_PATTERN, '[secret_ref]');
  return redacted.slice(0, 320);
}

export function safeProviderError(error: unknown): SafeProviderError {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown };
    return {
      name: redactSensitiveText(candidate.name || 'Error'),
      message: redactSensitiveText(candidate.message || 'Provider request failed.'),
      code: typeof candidate.code === 'string' ? redactSensitiveText(candidate.code) : undefined,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string'
      ? record.message
      : 'Provider request failed.';
    const code = typeof record.code === 'string' ? record.code : undefined;
    return {
      message: redactSensitiveText(message),
      code: code ? redactSensitiveText(code) : undefined,
    };
  }

  return {
    message: redactSensitiveText(normalizeLooseText(error) || 'Provider request failed.'),
  };
}

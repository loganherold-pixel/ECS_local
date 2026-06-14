export type NasaFirmsSource =
  | 'VIIRS_SNPP_NRT'
  | 'VIIRS_NOAA20_NRT'
  | 'VIIRS_NOAA21_NRT'
  | 'MODIS_NRT';

export type NasaFirmsHealthStatus =
  | 'disabled'
  | 'missing_config'
  | 'configured'
  | 'authenticated'
  | 'healthy'
  | 'degraded'
  | 'failed';

export type NasaFirmsSignalSeverity = 'watch' | 'caution' | 'warning';

export interface NasaFirmsConfig {
  enabled: boolean;
  apiKey: string | null;
  baseUrl: string;
  defaultSource: NasaFirmsSource;
  defaultDayRange: number;
  missingEnv: string[];
}

export interface NasaFirmsDetectionRow {
  [key: string]: string;
}

export interface NasaFirmsRequestInput {
  area?: string | [number, number, number, number] | null;
  source?: string | null;
  dayRange?: number | string | null;
  date?: string | null;
}

export interface NasaFirmsRequestDescriptor {
  kind: 'area';
  url: string;
  redactedUrl: string;
  cacheKey: string;
  area: string;
  source: NasaFirmsSource;
  dayRange: number;
  date: string | null;
  ttlSeconds: number;
}

export interface NasaFirmsSignal {
  id: string;
  source: 'nasa_firms';
  kind: 'wildfire_hotspot';
  severity: NasaFirmsSignalSeverity;
  title: string;
  summary: string;
  location: {
    latitude: number;
    longitude: number;
  };
  subject: {
    type: 'wildfire';
  };
  observedAt: string | null;
  validUntil: string | null;
  metrics: {
    frp: number | null;
    confidence: string | number | null;
    instrument: string | null;
    satellite: string | null;
    daynight: string | null;
    source: NasaFirmsSource | string;
  };
  raw: {
    rowIndex: number;
    source: NasaFirmsSource | string;
  };
}

export interface NasaFirmsProcessorOutput {
  title: string;
  summary: string;
  priority: NasaFirmsSignalSeverity;
  recommendations: string[];
  evidenceSignalIds: string[];
}

export interface NasaFirmsHealth {
  provider: 'nasa_firms';
  enabled: boolean;
  status: NasaFirmsHealthStatus;
  missingEnv: string[];
  apiKeyPresent: boolean;
  lastAuthCheckAt: string | null;
  lastFetchAt: string | null;
  lastProcessedAt: string | null;
  lastRecordCount: number;
  lastError: string | null;
}

export interface NasaFirmsCacheRecord<T> {
  key: string;
  value: T;
  cachedAt: string;
  expiresAt: string;
}

export const NASA_FIRMS_DEFAULT_BASE_URL = 'https://firms.modaps.eosdis.nasa.gov';
export const NASA_FIRMS_DEFAULT_SOURCE: NasaFirmsSource = 'VIIRS_SNPP_NRT';
export const NASA_FIRMS_DEFAULT_DAY_RANGE = 1;
export const NASA_FIRMS_ACTIVE_FIRE_TTL_SECONDS = 15 * 60;
export const NASA_FIRMS_DATA_AVAILABILITY_TTL_SECONDS = 12 * 60 * 60;
export const NASA_FIRMS_ALLOWED_SOURCES: NasaFirmsSource[] = [
  'VIIRS_SNPP_NRT',
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA21_NRT',
  'MODIS_NRT',
];

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

export function buildNasaFirmsRuntimeConfig(env: Record<string, string | undefined> = {}): NasaFirmsConfig {
  return buildNasaFirmsConfig((name) => env[name]);
}

export function buildNasaFirmsEdgeConfig(getEnv: (name: string) => string | undefined | null): NasaFirmsConfig {
  return buildNasaFirmsConfig(getEnv);
}

function buildNasaFirmsConfig(getEnv: (name: string) => string | undefined | null): NasaFirmsConfig {
  const enabled = parseBoolean(getEnv('NASA_FIRMS_ENABLED'), false);
  const apiKey = normalizeText(getEnv('NASA_FIRMS_API_KEY'));
  const baseUrl = normalizeBaseUrl(getEnv('NASA_FIRMS_API_BASE_URL')) ?? NASA_FIRMS_DEFAULT_BASE_URL;
  const defaultSource = validateNasaFirmsSource(getEnv('NASA_FIRMS_DEFAULT_SOURCE') ?? NASA_FIRMS_DEFAULT_SOURCE);
  const defaultDayRange = validateNasaFirmsDayRange(getEnv('NASA_FIRMS_DEFAULT_DAY_RANGE') ?? NASA_FIRMS_DEFAULT_DAY_RANGE);
  const missingEnv = enabled && !apiKey ? ['NASA_FIRMS_API_KEY'] : [];

  return {
    enabled,
    apiKey,
    baseUrl,
    defaultSource,
    defaultDayRange,
    missingEnv,
  };
}

export function buildNasaFirmsHealth(config: NasaFirmsConfig, state: {
  now?: Date;
  authenticated?: boolean;
  lastAuthCheckAt?: string | null;
  lastFetchAt?: string | null;
  lastProcessedAt?: string | null;
  lastRecordCount?: number | null;
  lastError?: string | null;
} = {}): NasaFirmsHealth {
  const missingMessage = config.missingEnv.length
    ? `Missing required NASA FIRMS configuration: ${config.missingEnv.join(', ')}`
    : null;
  const status: NasaFirmsHealthStatus = !config.enabled
    ? 'disabled'
    : config.missingEnv.length > 0
      ? 'missing_config'
      : state.lastError
        ? state.lastFetchAt || state.lastProcessedAt
          ? 'degraded'
          : 'failed'
        : state.lastProcessedAt
          ? 'healthy'
          : state.authenticated
            ? 'authenticated'
            : 'configured';

  return {
    provider: 'nasa_firms',
    enabled: config.enabled,
    status,
    missingEnv: [...config.missingEnv],
    apiKeyPresent: Boolean(config.apiKey),
    lastAuthCheckAt: state.lastAuthCheckAt ?? null,
    lastFetchAt: state.lastFetchAt ?? null,
    lastProcessedAt: state.lastProcessedAt ?? null,
    lastRecordCount: Math.max(0, Number(state.lastRecordCount ?? 0) || 0),
    lastError: sanitizeNasaFirmsError(missingMessage ?? state.lastError ?? null, config.apiKey),
  };
}

export function buildNasaFirmsMapKeyStatusUrl(config: NasaFirmsConfig): string {
  const apiKey = requireNasaFirmsApiKey(config);
  return `${config.baseUrl}/mapserver/mapkey_status/?MAP_KEY=${encodeURIComponent(apiKey)}`;
}

export function buildNasaFirmsDataAvailabilityUrl(config: NasaFirmsConfig, source: string | null = null): string {
  const apiKey = requireNasaFirmsApiKey(config);
  const scope = source ? validateNasaFirmsSource(source) : 'all';
  return `${config.baseUrl}/api/data_availability/csv/${encodeURIComponent(apiKey)}/${encodeURIComponent(scope)}`;
}

export function buildNasaFirmsAreaUrl(input: NasaFirmsRequestInput & { config: NasaFirmsConfig }): string {
  const request = buildNasaFirmsRequest(input.config, input);
  return request.url;
}

export function buildNasaFirmsRequest(config: NasaFirmsConfig, input: NasaFirmsRequestInput): NasaFirmsRequestDescriptor {
  const apiKey = requireNasaFirmsApiKey(config);
  const area = formatNasaFirmsArea(input.area);
  const source = validateNasaFirmsSource(input.source ?? config.defaultSource);
  const dayRange = validateNasaFirmsDayRange(input.dayRange ?? config.defaultDayRange);
  const date = validateNasaFirmsDate(input.date);
  const base = `${config.baseUrl}/api/area/csv/${encodeURIComponent(apiKey)}/${encodeURIComponent(source)}/${area}/${dayRange}`;
  const url = date ? `${base}/${date}` : base;
  return {
    kind: 'area',
    url,
    redactedUrl: redactNasaFirmsUrl(url, apiKey),
    cacheKey: ['nasa_firms:area', source, area, dayRange, date ?? 'latest'].join(':'),
    area,
    source,
    dayRange,
    date,
    ttlSeconds: NASA_FIRMS_ACTIVE_FIRE_TTL_SECONDS,
  };
}

export function validateNasaFirmsSource(value: unknown): NasaFirmsSource {
  const normalized = String(value ?? '').trim().toUpperCase();
  const allowed = NASA_FIRMS_ALLOWED_SOURCES.find((source) => source === normalized);
  if (!allowed) {
    throw new Error(`source must be one of: ${NASA_FIRMS_ALLOWED_SOURCES.join(', ')}`);
  }
  return allowed;
}

export function validateNasaFirmsDayRange(value: unknown): number {
  const dayRange = Number(value);
  if (!Number.isInteger(dayRange) || dayRange < 1 || dayRange > 5) {
    throw new Error('dayRange must be 1 through 5.');
  }
  return dayRange;
}

export function validateNasaFirmsDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('date must be YYYY-MM-DD.');
  }
  return date;
}

export function validateNasaFirmsArea(value: unknown): [number, number, number, number] {
  if (Array.isArray(value)) {
    if (value.length !== 4) throw new Error('area must be west,south,east,north.');
    return validateAreaNumbers(value);
  }
  const text = String(value ?? '').trim();
  if (!text) throw new Error('area is required and must be west,south,east,north.');
  const parts = text.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4) throw new Error('area must be west,south,east,north.');
  return validateAreaNumbers(parts);
}

export function formatNasaFirmsArea(value: unknown): string {
  return validateNasaFirmsArea(value)
    .map((coord) => Number(coord.toFixed(4)).toFixed(4))
    .join(',');
}

export function redactNasaFirmsUrl(value: string, apiKey: string | null | undefined): string {
  let redacted = String(value ?? '');
  const key = normalizeText(apiKey);
  if (key) {
    redacted = redacted.split(encodeURIComponent(key)).join('[REDACTED]');
    redacted = redacted.split(key).join('[REDACTED]');
  }
  redacted = redacted.replace(/(MAP_KEY=)[^&\s]+/gi, '$1[REDACTED]');
  redacted = redacted.replace(/\/api\/area\/csv\/[^/]+/gi, '/api/area/csv/[REDACTED]');
  redacted = redacted.replace(/\/api\/data_availability\/csv\/[^/]+/gi, '/api/data_availability/csv/[REDACTED]');
  return redacted;
}

export function sanitizeNasaFirmsError(value: unknown, apiKey: string | null | undefined): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  return redactNasaFirmsUrl(text, apiKey)
    .replace(/[A-Za-z0-9_-]{24,}/g, '[REDACTED]')
    .slice(0, 300);
}

export function parseNasaFirmsCsv(csv: string): NasaFirmsDetectionRow[] {
  const lines = String(csv ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function normalizeNasaFirmsDetections(
  rows: NasaFirmsDetectionRow[],
  options: { now?: Date; source?: string | null } = {},
): NasaFirmsSignal[] {
  const source = options.source ? validateNasaFirmsSource(options.source) : NASA_FIRMS_DEFAULT_SOURCE;
  const now = options.now ?? new Date();
  return rows
    .map((row, index): NasaFirmsSignal | null => {
      const latitude = toNumber(row.latitude ?? row.lat);
      const longitude = toNumber(row.longitude ?? row.lon ?? row.lng);
      if (latitude == null || longitude == null) return null;
      const observedAt = acquisitionTimestamp(row);
      const severity = severityFromFirms(row.confidence, row.frp);
      return {
        id: `nasa_firms:${source}:${observedAt ?? now.toISOString()}:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${index}`,
        source: 'nasa_firms' as const,
        kind: 'wildfire_hotspot' as const,
        severity,
        title: 'NASA FIRMS wildfire hotspot',
        summary: `Satellite hotspot detected near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}. FIRMS detections are evidence, not closure orders.`,
        location: { latitude, longitude },
        subject: { type: 'wildfire' as const },
        observedAt,
        validUntil: new Date(now.getTime() + NASA_FIRMS_ACTIVE_FIRE_TTL_SECONDS * 1000).toISOString(),
        metrics: {
          frp: toNumber(row.frp),
          confidence: normalizeConfidenceMetric(row.confidence),
          instrument: normalizeText(row.instrument ?? row.sensor),
          satellite: normalizeText(row.satellite),
          daynight: normalizeText(row.daynight),
          source,
        },
        raw: {
          rowIndex: index,
          source,
        },
      };
    })
    .filter((signal): signal is NasaFirmsSignal => Boolean(signal));
}

export function processNasaFirmsWildfireSignals(
  signals: NasaFirmsSignal[],
  _options: { now?: Date } = {},
): NasaFirmsProcessorOutput {
  const evidenceSignalIds = signals.map((signal) => signal.id);
  const highConfidenceCount = signals.filter((signal) => signal.severity === 'warning').length;
  const priority = signals.some((signal) => signal.severity === 'warning')
    ? 'warning'
    : signals.some((signal) => signal.severity === 'caution')
      ? 'caution'
      : 'watch';
  const regionCount = new Set(signals.map((signal) => clusterKey(signal.location.latitude, signal.location.longitude))).size;
  const summary = signals.length === 0
    ? 'No NASA FIRMS detections were processed for this area.'
    : `${signals.length} satellite detections across ${regionCount} nearby region${regionCount === 1 ? '' : 's'}; ${highConfidenceCount} high-confidence hotspot${highConfidenceCount === 1 ? '' : 's'}.`;

  return {
    title: signals.length > 1 ? 'NASA FIRMS wildfire hotspot cluster' : 'NASA FIRMS wildfire hotspot',
    summary,
    priority,
    recommendations: signals.length === 0
      ? ['Keep FIRMS disabled for this area until an operator requests an active fire check.']
      : [
          'Verify detections against current agency incident and closure sources before changing route guidance.',
          'Review nearby bailout options and smoke/weather context when detections cluster near a route.',
        ],
    evidenceSignalIds,
  };
}

export class NasaFirmsMemoryCache {
  private records = new Map<string, NasaFirmsCacheRecord<unknown>>();

  get<T>(key: string, now = new Date()): T | null {
    const record = this.records.get(key);
    if (!record) return null;
    if (Date.parse(record.expiresAt) <= now.getTime()) {
      this.records.delete(key);
      return null;
    }
    return record.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number, now = new Date()): T {
    this.records.set(key, {
      key,
      value,
      cachedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + Math.max(0, ttlSeconds) * 1000).toISOString(),
    });
    return value;
  }

  clear(): void {
    this.records.clear();
  }
}

function requireNasaFirmsApiKey(config: NasaFirmsConfig): string {
  if (!config.enabled) throw new Error('NASA FIRMS is disabled.');
  if (!config.apiKey) throw new Error('Missing required NASA FIRMS configuration: NASA_FIRMS_API_KEY');
  return config.apiKey;
}

function validateAreaNumbers(values: unknown[]): [number, number, number, number] {
  const [west, south, east, north] = values.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) {
    throw new Error('area must be west,south,east,north.');
  }
  if (west < -180 || east < -180 || west > 180 || east > 180 || south < -90 || north < -90 || south > 90 || north > 90) {
    throw new Error('area coordinates are outside valid longitude/latitude bounds.');
  }
  if (west >= east || south >= north) {
    throw new Error('area must have west < east and south < north.');
  }
  return [west, south, east, north];
}

function severityFromFirms(confidence: unknown, frpValue: unknown): NasaFirmsSignalSeverity {
  const raw = String(confidence ?? '').trim().toLowerCase();
  const numeric = toNumber(confidence);
  const frp = toNumber(frpValue) ?? 0;
  let severity: NasaFirmsSignalSeverity =
    raw === 'h' || raw === 'high' || (numeric != null && numeric >= 80)
      ? 'warning'
      : raw === 'n' || raw === 'nominal' || (numeric != null && numeric >= 40)
        ? 'caution'
        : 'watch';
  if (frp >= 75 && severity === 'watch') severity = 'caution';
  if (frp >= 150 && severity === 'caution') severity = 'warning';
  return severity;
}

function normalizeConfidenceMetric(value: unknown): string | number | null {
  const numeric = toNumber(value);
  if (numeric != null) return numeric;
  return normalizeText(value);
}

function acquisitionTimestamp(row: Record<string, unknown>): string | null {
  const date = normalizeText(row.acq_date);
  const time = String(row.acq_time ?? '').trim().padStart(4, '0');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{4}$/.test(time)) {
    const parsed = Date.parse(`${date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function splitCsvLine(line: string): string[] {
  const output: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      output.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  output.push(current);
  return output.map((value) => value.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function normalizeBaseUrl(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\/+$/, '') : null;
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clusterKey(latitude: number, longitude: number): string {
  return `${Math.round(latitude * 4) / 4}:${Math.round(longitude * 4) / 4}`;
}

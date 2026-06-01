import type { NormalizedWeatherForecast } from './weatherNormalization';

export type WeatherForecastRowKeyScope = {
  widgetType: string;
  sourceType?: string | null;
  provider?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  routeScope?: string | null;
};

export type WeatherForecastRenderRow = {
  key: string;
  rowKey: string;
  stableId: string;
  label: string;
  value: string;
  forecast: NormalizedWeatherForecast;
  occurrence: number;
};

type WeatherForecastRowFormatter = {
  label: (day: NormalizedWeatherForecast, index: number) => string;
  value: (day: NormalizedWeatherForecast, index: number) => string;
};

const FORECAST_ID_FIELDS = [
  'id',
  'forecastId',
  'forecast_id',
  'periodId',
  'period_id',
  'bucketId',
  'bucket_id',
];

const FORECAST_PERIOD_FIELDS = [
  'period',
  'periodName',
  'period_name',
  'bucket',
  'bucketName',
  'bucket_name',
  'daypart',
  'dayPart',
  'day_part',
];

const FORECAST_SOURCE_FIELDS = ['source', 'provider', 'providerId', 'provider_id'];
const FORECAST_LOCATION_FIELDS = ['locationId', 'location_id', 'routeScope', 'route_scope'];
const FORECAST_ADVISORY_FIELDS = ['advisoryType', 'advisory_type', 'severity', 'category', 'type'];

const loggedDuplicateForecastRows = new Set<string>();

function readStableString(source: unknown, fields: string[]): string | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;

  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return null;
}

function keySegment(value: string | number | null | undefined, fallback = 'unknown'): string {
  const raw = value == null ? fallback : String(value).trim();
  const normalized = raw || fallback;
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function normalizeForecastTimeKey(time: string | null | undefined): string {
  if (!time?.trim()) return 'time-unknown';
  const trimmed = time.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return trimmed;
}

function numberKey(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? 'na' : String(Number(value.toFixed(3)));
}

function getWeatherForecastIdentity(
  day: NormalizedWeatherForecast,
  scope: WeatherForecastRowKeyScope,
): string {
  return [
    scope.widgetType,
    readStableString(day, FORECAST_ID_FIELDS),
    normalizeForecastTimeKey(day.time),
    readStableString(day, FORECAST_PERIOD_FIELDS),
    readStableString(day, FORECAST_SOURCE_FIELDS) ?? scope.provider ?? scope.sourceType,
    readStableString(day, FORECAST_LOCATION_FIELDS) ?? scope.locationId ?? scope.routeScope ?? scope.locationName,
    readStableString(day, FORECAST_ADVISORY_FIELDS),
    day.condition,
    numberKey(day.temperatureF),
    numberKey(day.highTemperatureF),
    numberKey(day.lowTemperatureF),
    numberKey(day.windMph),
    numberKey(day.windGustMph),
    numberKey(day.windDirectionDeg),
    numberKey(day.precipitationChance),
  ].map((part) => keySegment(part)).join('|');
}

export function getWeatherForecastRowKey(
  day: NormalizedWeatherForecast,
  scope: WeatherForecastRowKeyScope,
): string {
  const explicitId = readStableString(day, FORECAST_ID_FIELDS);
  const period = readStableString(day, FORECAST_PERIOD_FIELDS);
  const source = readStableString(day, FORECAST_SOURCE_FIELDS) ?? scope.provider ?? scope.sourceType;
  const location = readStableString(day, FORECAST_LOCATION_FIELDS) ?? scope.locationId ?? scope.routeScope ?? scope.locationName;
  const advisory = readStableString(day, FORECAST_ADVISORY_FIELDS);

  if (explicitId) {
    return [
      scope.widgetType,
      'forecast',
      source,
      location,
      advisory,
      explicitId,
    ].map((part) => keySegment(part)).join('|');
  }

  return [
    scope.widgetType,
    'forecast',
    normalizeForecastTimeKey(day.time),
    period,
    source,
    location,
    advisory,
  ].map((part) => keySegment(part)).join('|');
}

function isDevRuntime(): boolean {
  const globalDev = (globalThis as unknown as { __DEV__?: unknown }).__DEV__;
  if (typeof globalDev === 'boolean') return globalDev;
  const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return processEnv?.NODE_ENV !== 'production';
}

function getForecastDebugMetadata(day: NormalizedWeatherForecast, scope: WeatherForecastRowKeyScope) {
  const record = day as unknown as Record<string, unknown>;
  return {
    widgetType: scope.widgetType,
    sourceType: scope.sourceType ?? null,
    provider: readStableString(day, FORECAST_SOURCE_FIELDS) ?? scope.provider ?? null,
    location: readStableString(day, FORECAST_LOCATION_FIELDS) ?? scope.locationId ?? scope.locationName ?? null,
    routeScope: scope.routeScope ?? null,
    sourceShape: typeof record.sourceShape === 'string' ? record.sourceShape : null,
    sourceIndex: typeof record.sourceIndex === 'number' ? record.sourceIndex : null,
    sourceState: typeof record.sourceState === 'string' ? record.sourceState : null,
    time: day.time,
    period: readStableString(day, FORECAST_PERIOD_FIELDS),
    advisory: readStableString(day, FORECAST_ADVISORY_FIELDS),
    condition: day.condition ?? null,
    highTemperatureF: day.highTemperatureF ?? null,
    lowTemperatureF: day.lowTemperatureF ?? null,
    windMph: day.windMph ?? null,
    precipitationChance: day.precipitationChance ?? null,
  };
}

function logDuplicateForecastRowOnce(params: {
  identity: string;
  existing: NormalizedWeatherForecast;
  duplicate: NormalizedWeatherForecast;
  scope: WeatherForecastRowKeyScope;
}) {
  if (!isDevRuntime() || loggedDuplicateForecastRows.has(params.identity)) return;
  loggedDuplicateForecastRows.add(params.identity);
  console.warn('[dashboard-weather] duplicate forecast source row deduped', {
    identity: params.identity,
    existing: getForecastDebugMetadata(params.existing, params.scope),
    duplicate: getForecastDebugMetadata(params.duplicate, params.scope),
  });
}

export function normalizeWeatherForecastRows(
  days: Array<NormalizedWeatherForecast | null | undefined>,
  scope: WeatherForecastRowKeyScope,
  formatter: WeatherForecastRowFormatter,
  maxRows = days.length,
): WeatherForecastRenderRow[] {
  const byIdentity = new Map<string, NormalizedWeatherForecast>();
  const normalizedEntries: Array<{
    day: NormalizedWeatherForecast;
    identity: string;
    baseKey: string;
  }> = [];

  for (const day of days) {
    if (!day) continue;
    const identity = getWeatherForecastIdentity(day, scope);
    const existing = byIdentity.get(identity);
    if (existing) {
      logDuplicateForecastRowOnce({ identity, existing, duplicate: day, scope });
      continue;
    }
    byIdentity.set(identity, day);

    normalizedEntries.push({
      day,
      identity,
      baseKey: getWeatherForecastRowKey(day, scope),
    });
  }

  const occurrenceByIdentity = new Map<string, number>();
  const identitiesByBaseKey = new Map<string, string[]>();

  for (const entry of normalizedEntries) {
    const identitiesForBaseKey = identitiesByBaseKey.get(entry.baseKey) ?? [];
    identitiesForBaseKey.push(entry.identity);
    identitiesByBaseKey.set(entry.baseKey, identitiesForBaseKey);
  }

  for (const identitiesForBaseKey of identitiesByBaseKey.values()) {
    identitiesForBaseKey.sort().forEach((identity, index) => {
      occurrenceByIdentity.set(identity, index + 1);
    });
  }

  return normalizedEntries.slice(0, maxRows).map((entry, index) => {
    const occurrence = occurrenceByIdentity.get(entry.identity) ?? 1;
    const duplicateCount = identitiesByBaseKey.get(entry.baseKey)?.length ?? 1;
    const key = duplicateCount <= 1 ? entry.baseKey : `${entry.baseKey}|occurrence-${occurrence}`;

    return {
      key,
      rowKey: key,
      stableId: key,
      label: formatter.label(entry.day, index),
      value: formatter.value(entry.day, index),
      forecast: entry.day,
      occurrence,
    };
  });
}

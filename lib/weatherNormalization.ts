export type WeatherUnits = 'imperial' | 'metric';
export type WindSpeedUnit = WeatherUnits | 'mph' | 'mps' | 'kmh' | 'kph' | 'knots';

export type ECSWeatherSnapshotSource = 'live' | 'cache' | 'unavailable';

export type NormalizedWeatherForecast = {
  time: string;
  temperatureF?: number;
  highTemperatureF?: number;
  lowTemperatureF?: number;
  sunrise?: number;
  sunset?: number;
  condition?: string;
  windMph?: number;
  windGustMph?: number;
  windDirectionDeg?: number;
  precipitationChance?: number;
};

export type NormalizedWeatherCurrent = {
  tempF?: number;
  tempC?: number;
  temperature?: number;
  temperatureF?: number;
  temperatureC?: number;
  feelsLikeF?: number;
  condition?: string;
  windMph?: number;
  windGustMph?: number;
  windDirectionDeg?: number;
  precipitationChance?: number;
  pressureHpa?: number;
  sunrise?: number;
  sunset?: number;
  highTemperatureF?: number;
  lowTemperatureF?: number;
};

export type ECSNormalizedWeatherSnapshot = {
  source: ECSWeatherSnapshotSource;
  updatedAt?: string;
  current?: NormalizedWeatherCurrent;
  forecast?: NormalizedWeatherForecast[];
  error?: string;
};

export function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeTemperatureF(
  value: unknown,
  units: WeatherUnits = 'imperial',
): number | null {
  const n = toFiniteNumber(value);
  if (n == null) return null;
  return units === 'metric' ? (n * 9) / 5 + 32 : n;
}

export function normalizeTemperatureC(
  value: unknown,
  units: WeatherUnits = 'imperial',
): number | null {
  const n = toFiniteNumber(value);
  if (n == null) return null;
  return units === 'imperial' ? ((n - 32) * 5) / 9 : n;
}

function readFirstFiniteNumber(source: unknown, keys: string[]): number | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const direct = toFiniteNumber(record[key]);
    if (direct != null) return direct;

    const parts = key.split('.');
    if (parts.length > 1) {
      let cursor: unknown = record;
      for (const part of parts) {
        if (!cursor || typeof cursor !== 'object') {
          cursor = null;
          break;
        }
        cursor = (cursor as Record<string, unknown>)[part];
      }
      const nested = toFiniteNumber(cursor);
      if (nested != null) return nested;
    }
  }

  return null;
}

export function normalizeWeatherTemperatureF(
  source: unknown,
  units: WeatherUnits = 'imperial',
  genericKeys: string[] = ['temp', 'temperature', 'temperature_2m', 'airTemperature', 'current.temperature', 'current.temp'],
): number | null {
  const explicitF = readFirstFiniteNumber(source, [
    'tempF',
    'temperatureF',
    'temp_f',
    'airTemperatureF',
    'current.tempF',
    'current.temperatureF',
    'current.temp_f',
  ]);
  if (explicitF != null) return explicitF;

  const explicitC = readFirstFiniteNumber(source, [
    'tempC',
    'temperatureC',
    'temp_c',
    'airTemperatureC',
    'current.tempC',
    'current.temperatureC',
    'current.temp_c',
  ]);
  if (explicitC != null) return normalizeTemperatureF(explicitC, 'metric');

  return normalizeTemperatureF(readFirstFiniteNumber(source, genericKeys), units);
}

export function normalizeWeatherTemperatureC(
  source: unknown,
  units: WeatherUnits = 'imperial',
  genericKeys: string[] = ['temp', 'temperature', 'temperature_2m', 'airTemperature', 'current.temperature', 'current.temp'],
): number | null {
  const explicitC = readFirstFiniteNumber(source, [
    'tempC',
    'temperatureC',
    'temp_c',
    'airTemperatureC',
    'current.tempC',
    'current.temperatureC',
    'current.temp_c',
  ]);
  if (explicitC != null) return explicitC;

  const explicitF = readFirstFiniteNumber(source, [
    'tempF',
    'temperatureF',
    'temp_f',
    'airTemperatureF',
    'current.tempF',
    'current.temperatureF',
    'current.temp_f',
  ]);
  if (explicitF != null) return normalizeTemperatureC(explicitF, 'imperial');

  return normalizeTemperatureC(readFirstFiniteNumber(source, genericKeys), units);
}

export function normalizeWindSpeed(
  value: unknown,
  sourceUnit: WindSpeedUnit = 'imperial',
): number | null {
  const n = toFiniteNumber(value);
  if (n == null) return null;

  switch (sourceUnit) {
    case 'metric':
    case 'mps':
      return n * 2.2369362921;
    case 'kmh':
    case 'kph':
      return n * 0.6213711922;
    case 'knots':
      return n * 1.150779448;
    case 'imperial':
    case 'mph':
    default:
      return n;
  }
}

export function weatherSourceFromFetchSource(
  source: string | null | undefined,
): ECSWeatherSnapshotSource {
  if (source === 'live') return 'live';
  if (source === 'cache_fresh' || source === 'cache_stale') return 'cache';
  return 'unavailable';
}

export function formatWeatherDegrees(value: unknown, unavailable = '--°'): string {
  const n = toFiniteNumber(value);
  return n == null ? unavailable : `${Math.round(n)}°`;
}

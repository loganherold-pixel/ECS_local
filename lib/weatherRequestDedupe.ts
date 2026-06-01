import type { WeatherCoordinate } from './weatherTypes';

type WeatherRequestMode = 'coordinates' | 'location';

export type WeatherRequestKeyInput = {
  mode: WeatherRequestMode;
  coordinates: WeatherCoordinate[];
  units: 'imperial' | 'metric';
  forceRefresh: boolean;
  context?: string | null;
};

const inFlightWeatherRequests = new Map<string, Promise<unknown>>();

function roundCoord(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : 'na';
}

export function buildWeatherRequestKey(input: WeatherRequestKeyInput): string {
  const coords = input.coordinates
    .map(coord => `${roundCoord(coord.lat)},${roundCoord(coord.lng)}`)
    .join('|');
  return [
    input.mode,
    coords,
    input.units,
    input.forceRefresh ? 'force' : 'normal',
    input.context ?? 'default',
  ].join('::');
}

export function runDedupedWeatherRequest<T>(
  key: string,
  request: () => Promise<T>,
  onJoinedExisting?: () => void,
): Promise<T> {
  const existing = inFlightWeatherRequests.get(key);
  if (existing) {
    onJoinedExisting?.();
    return existing as Promise<T>;
  }

  const next = Promise.resolve()
    .then(request)
    .finally(() => {
      if (inFlightWeatherRequests.get(key) === next) {
        inFlightWeatherRequests.delete(key);
      }
    });

  inFlightWeatherRequests.set(key, next);
  return next;
}

export function getInFlightWeatherRequestCount(): number {
  return inFlightWeatherRequests.size;
}

export function clearInFlightWeatherRequests(): void {
  inFlightWeatherRequests.clear();
}

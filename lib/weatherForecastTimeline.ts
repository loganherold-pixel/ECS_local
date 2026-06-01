import type { DailyForecast } from './weatherTypes';

export function getDailyForecastDateKey(date: string): string {
  return String(date ?? '').slice(0, 10);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function minKnown(current: number | null, next: number | null): number | null {
  if (!isFiniteNumber(current)) return isFiniteNumber(next) ? next : null;
  if (!isFiniteNumber(next)) return current;
  return Math.min(current, next);
}

function maxKnown(current: number | null, next: number | null): number | null {
  if (!isFiniteNumber(current)) return isFiniteNumber(next) ? next : null;
  if (!isFiniteNumber(next)) return current;
  return Math.max(current, next);
}

function sumKnown(current: number, next: number): number {
  const currentValue = isFiniteNumber(current) ? current : 0;
  const nextValue = isFiniteNumber(next) ? next : 0;
  return currentValue + nextValue;
}

function firstKnown<T>(current: T | null | undefined, next: T | null | undefined): T | null {
  if (current != null && current !== '') return current;
  if (next != null && next !== '') return next;
  return null;
}

export function normalizeDailyForecastRows(
  forecast: DailyForecast[],
  limit = 7,
): DailyForecast[] {
  const byDate = new Map<string, DailyForecast>();

  forecast.forEach((day) => {
    const dateKey = getDailyForecastDateKey(day.date);
    if (!dateKey) return;

    const existing = byDate.get(dateKey);
    if (!existing) {
      byDate.set(dateKey, {
        ...day,
        date: dateKey,
      });
      return;
    }

    byDate.set(dateKey, {
      ...existing,
      date: dateKey,
      temp_day: firstKnown(existing.temp_day, day.temp_day),
      temp_min: minKnown(existing.temp_min, day.temp_min),
      temp_max: maxKnown(existing.temp_max, day.temp_max),
      humidity: firstKnown(existing.humidity, day.humidity),
      pressure: firstKnown(existing.pressure, day.pressure),
      wind_max: maxKnown(existing.wind_max, day.wind_max),
      wind_gust_max: maxKnown(existing.wind_gust_max, day.wind_gust_max),
      wind_deg: firstKnown(existing.wind_deg, day.wind_deg),
      sunrise: firstKnown(existing.sunrise, day.sunrise),
      sunset: firstKnown(existing.sunset, day.sunset),
      pop: maxKnown(existing.pop, day.pop) ?? 0,
      rain_total: sumKnown(existing.rain_total, day.rain_total),
      snow_total: sumKnown(existing.snow_total, day.snow_total),
      weather_id: firstKnown(existing.weather_id, day.weather_id),
      weather_main: firstKnown(existing.weather_main, day.weather_main) ?? '',
      weather_description: firstKnown(existing.weather_description, day.weather_description) ?? '',
      weather_icon: firstKnown(existing.weather_icon, day.weather_icon) ?? '',
    });
  });

  return Array.from(byDate.values())
    .sort((a, b) => getDailyForecastDateKey(a.date).localeCompare(getDailyForecastDateKey(b.date)))
    .slice(0, limit);
}

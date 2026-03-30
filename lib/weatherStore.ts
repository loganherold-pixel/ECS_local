/**
 * Weather Intelligence Store
 *
 * Manages weather data fetching, caching, and offline support.
 * Uses the get-weather Supabase Edge Function to fetch data from OpenWeather API.
 *
 * ── Edge Function Contract ────────────────────────────────────
 *
 * The get-weather edge function MUST:
 *   1. Read the API key via: Deno.env.get("OPENWEATHER_API_KEY")
 *      - Set via: supabase secrets set OPENWEATHER_API_KEY=<your-key>
 *      - NEVER hardcode the key in client code or the repo
 *
 *   2. Accept two input formats:
 *      Simple:  { lat: number, lon: number, units?: "imperial" | "metric" }
 *      Multi:   { coordinates: [{ lat, lng, label? }], units?: "imperial" | "metric" }
 *
 *   3. Set CORS headers:
 *      Access-Control-Allow-Origin: *
 *      Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
 *      Handle OPTIONS requests by returning 200.
 *
 *   4. Return normalized JSON:
 *      {
 *        results: WaypointWeather[],
 *        fetched_at: ISO8601,
 *        units: "imperial" | "metric",
 *        // Simple format also includes:
 *        location?: { lat, lon },
 *        current?: { temp, feels_like, humidity, wind_speed, wind_deg, weather_main, weather_desc, icon },
 *        updated_at?: ISO8601
 *      }
 *
 *   5. Return errors:
 *      Missing OPENWEATHER_API_KEY → { error: "Missing OPENWEATHER_API_KEY" } with 500
 *      OpenWeather fetch failure   → { error: "Weather fetch failed", details } with 502
 *      Invalid input               → { error: "Invalid request body", details } with 400
 *
 * ── Client Invocation ─────────────────────────────────────────
 *
 *   supabase.functions.invoke("get-weather", {
 *     body: { lat, lon, units: "imperial" }
 *   })
 *
 *   supabase.functions.invoke("get-weather", {
 *     body: { coordinates: [...], units: "imperial" }
 *   })
 *
 * ── Offline Strategy ──────────────────────────────────────────
 *
 *   1. Always check cache first (fresh < 30 min)
 *   2. On fetch failure, return stale cache (any age) with staleness indicator
 *   3. If no cache exists at all, return synthetic fallback data marked as unavailable
 *   4. Cache is persisted to localStorage (web) AND in-memory (all platforms)
 *   5. Stale cache is never deleted — only overwritten by fresh data
 *
 * ── Cross-Platform Caching ────────────────────────────────────
 *
 *   - Web: localStorage (persists across reloads) + in-memory (fast access)
 *   - Native: in-memory only (survives for app session)
 *   - Both tiers are checked; in-memory is always populated from localStorage on read
 *
 * ── Retry Logic ───────────────────────────────────────────────
 *
 *   - Single retry with 2s delay on transient failures
 *   - No retry on auth errors (401), API key errors, or validation errors (400)
 */
import { Platform } from 'react-native';
import { supabase } from './supabase';
import * as rateLimitStore from './rateLimitStore';
import { connectivity } from './connectivity';
import type {

  WeatherCoordinate,
  WeatherResponse,
  WaypointWeather,
  CachedWeather,
  CurrentConditions,
  DailyForecast,
  TrailConditions,
} from './weatherTypes';

// ── Cache Configuration ──────────────────────────────────────
const CACHE_KEY_PREFIX = 'ecs_weather_';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes = "fresh"
const STALE_WARNING_MS = 2 * 60 * 60 * 1000; // 2 hours = "stale warning"
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours = max useful cache
const RETRY_DELAY_MS = 2000; // 2 seconds between retries

// ── In-Memory Cache (cross-platform) ─────────────────────────
// Always available on both web and native platforms.
// On web, this is populated from localStorage on first read.
// On native, this is the only cache tier.
const memoryCache = new Map<string, CachedWeather>();

// ── Helpers ──────────────────────────────────────────────────

function coordKey(coords: WeatherCoordinate[]): string {
  return coords.map(c => `${c.lat.toFixed(3)}_${c.lng.toFixed(3)}`).join('|');
}

function singleCoordKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

/**
 * Determine if an error is related to the OPENWEATHER_API_KEY configuration.
 * These errors should NOT be retried — they require admin intervention.
 */
function isApiKeyError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('missing openweather_api_key') ||
    lower.includes('openweather_api_key') ||
    lower.includes('invalid api key') ||
    lower.includes('authentication failed') ||
    lower.includes('401')
  );
}

/**
 * Determine if an error is a validation/client error that should NOT be retried.
 */
function isNonRetryableError(message: string): boolean {
  return (
    isApiKeyError(message) ||
    message.includes('Invalid') ||
    message.includes('400') ||
    message.includes('not configured')
  );
}

/**
 * Read from localStorage (web only). Returns null on native or if not found.
 */
function readLocalStorage(key: string): CachedWeather | null {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CachedWeather;
  } catch {
    return null;
  }
}

/**
 * Write to localStorage (web only). Silently fails on native.
 */
function writeLocalStorage(key: string, cached: CachedWeather): void {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(cached));
  } catch {
    // Storage full or unavailable — non-fatal
  }
}

/**
 * Get cached weather data from both tiers.
 * @param key - coordinate key
 * @param ignoreExpiry - if true, returns cache regardless of age (for offline fallback)
 */
function getCached(key: string, ignoreExpiry = false): CachedWeather | null {
  // Tier 1: In-memory cache (fastest)
  let cached = memoryCache.get(key) || null;

  // Tier 2: localStorage (web only, persists across reloads)
  if (!cached) {
    cached = readLocalStorage(key);
    // Populate in-memory cache from localStorage
    if (cached) {
      memoryCache.set(key, cached);
    }
  }

  if (!cached) return null;

  if (!ignoreExpiry) {
    // Only return if within fresh window
    if (Date.now() - cached.cachedAt > CACHE_DURATION_MS) {
      return null; // Expired for "fresh" purposes, but don't delete
    }
  }

  return cached;
}

/**
 * Get stale cached weather data — returns cache regardless of age.
 * Used as fallback when network is unavailable.
 */
function getStaleCached(key: string): CachedWeather | null {
  return getCached(key, true);
}

/**
 * Write cache to both tiers.
 */
function setCache(key: string, data: WeatherResponse): void {
  const cached: CachedWeather = {
    data,
    cachedAt: Date.now(),
    coordKey: key,
  };

  // Tier 1: In-memory (always)
  memoryCache.set(key, cached);

  // Tier 2: localStorage (web only)
  writeLocalStorage(key, cached);
}

// ── Cache Age Utilities ──────────────────────────────────────

/**
 * Check if cached weather data is stale (older than fresh window).
 */
export function isWeatherStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > CACHE_DURATION_MS;
}

/**
 * Get human-readable age of cached data.
 */
export function getWeatherAge(cachedAt: number): string {
  const ageMs = Date.now() - cachedAt;
  const mins = Math.floor(ageMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

/**
 * Get staleness severity level for UI display.
 */
export function getWeatherStaleness(cachedAt: number): 'fresh' | 'aging' | 'stale' | 'very_stale' {
  const ageMs = Date.now() - cachedAt;
  if (ageMs <= CACHE_DURATION_MS) return 'fresh';
  if (ageMs <= STALE_WARNING_MS) return 'aging';
  if (ageMs <= MAX_CACHE_AGE_MS) return 'stale';
  return 'very_stale';
}

// ── Fallback Data Generation ─────────────────────────────────

/**
 * Generate synthetic fallback weather data when no cache exists
 * and the network is unavailable. Marked clearly as unavailable
 * so the UI can display appropriate warnings.
 */
function generateFallbackWeather(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
): WeatherResponse {
  const results: WaypointWeather[] = coordinates.map(coord => ({
    lat: coord.lat,
    lng: coord.lng,
    label: coord.label || 'Unknown Location',
    error: 'Weather data unavailable — offline with no cached data',
    current: {
      temp: null,
      feels_like: null,
      temp_min: null,
      temp_max: null,
      humidity: null,
      pressure: null,
      visibility: null,
      wind_speed: null,
      wind_deg: null,
      wind_gust: null,
      clouds: null,
      weather_id: null,
      weather_main: null,
      weather_description: null,
      weather_icon: null,
      rain_1h: null,
      rain_3h: null,
      snow_1h: null,
      snow_3h: null,
      sunrise: null,
      sunset: null,
      location_name: coord.label || null,
      dt: null,
    },
    forecast: [],
    alerts: [],
    trail_conditions: {
      overall: 'fair' as const,
      factors: [
        {
          factor: 'Data Availability',
          status: 'caution' as const,
          detail: 'Weather data unavailable. Unable to assess current trail conditions. Exercise caution and rely on visual assessment.',
        },
      ],
    },
  }));

  return {
    results,
    fetched_at: new Date().toISOString(),
    units,
  };
}

// ── Edge Function Calls ──────────────────────────────────────

/**
 * Call the get-weather edge function with the MULTI-coordinate format.
 * Sends: { coordinates: [{ lat, lng, label? }], units }
 * Returns the parsed WeatherResponse or throws on failure.
 *
 * Includes retry logic: 1 retry with 2s delay on transient failures.
 * Does NOT retry on API key errors (OPENWEATHER_API_KEY missing/invalid),
 * auth errors (401), or validation errors (400).
 */
async function callWeatherEdgeFunction(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric',
  retryCount = 1,
): Promise<WeatherResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      if (attempt > 0) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        console.log(`[WeatherStore] Retry attempt ${attempt}/${retryCount}`);
      }

      const { data, error } = await supabase.functions.invoke('get-weather', {
        body: { coordinates, units },
      });

      if (error) {
        // Supabase client-level error (network, CORS, etc.)
        const errMsg = typeof error === 'string' ? error : error?.message || 'Edge function error';

        // Don't retry on API key or validation errors
        if (isNonRetryableError(errMsg)) {
          throw new Error(errMsg);
        }

        lastError = new Error(errMsg);
        continue; // Retry on transient errors
      }

      if (!data) {
        lastError = new Error('Empty response from weather service');
        continue;
      }

      // Handle edge function returning error in the response body
      if (data.error && !data.results) {
        const errMsg = data.error + (data.details ? `: ${data.details}` : '');

        // Don't retry on API key or validation errors
        if (isNonRetryableError(errMsg)) {
          throw new Error(errMsg);
        }

        lastError = new Error(errMsg);
        continue;
      }

      // Validate response has results array
      if (!data.results || !Array.isArray(data.results)) {
        lastError = new Error('Invalid response format from weather service');
        continue;
      }

      return data as WeatherResponse;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || 'Unknown error');

      // Don't retry on non-transient errors
      if (isNonRetryableError(lastError.message)) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Failed to fetch weather after retries');
}

/**
 * Call the get-weather edge function with the SIMPLE single-coordinate format.
 * Sends: { lat, lon, units }
 * Returns the parsed WeatherResponse or throws on failure.
 *
 * This uses the simplified input format supported by the edge function.
 * The response includes both the `results` array AND flat `location`/`current`/`updated_at` fields.
 *
 * Includes retry logic: 1 retry with 2s delay on transient failures.
 */
async function callSimpleWeatherEdgeFunction(
  lat: number,
  lon: number,
  units: 'imperial' | 'metric',
  retryCount = 1,
): Promise<WeatherResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        console.log(`[WeatherStore] Simple retry attempt ${attempt}/${retryCount}`);
      }

      // Use the simple { lat, lon, units } format
      const { data, error } = await supabase.functions.invoke('get-weather', {
        body: { lat, lon, units },
      });

      if (error) {
        const errMsg = typeof error === 'string' ? error : error?.message || 'Edge function error';
        if (isNonRetryableError(errMsg)) throw new Error(errMsg);
        lastError = new Error(errMsg);
        continue;
      }

      if (!data) {
        lastError = new Error('Empty response from weather service');
        continue;
      }

      // Handle error in response body
      if (data.error && !data.results) {
        const errMsg = data.error + (data.details ? `: ${data.details}` : '');
        if (isNonRetryableError(errMsg)) throw new Error(errMsg);
        lastError = new Error(errMsg);
        continue;
      }

      // Validate response has results array
      if (!data.results || !Array.isArray(data.results)) {
        lastError = new Error('Invalid response format from weather service');
        continue;
      }

      return data as WeatherResponse;
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(err?.message || 'Unknown error');
      if (isNonRetryableError(lastError.message)) throw lastError;
    }
  }

  throw lastError || new Error('Failed to fetch weather after retries');
}

// ── Main Fetch Function ──────────────────────────────────────

export interface WeatherFetchResult {
  data: WeatherResponse;
  source: 'live' | 'cache_fresh' | 'cache_stale' | 'fallback';
  cachedAt: number | null;
  error: string | null;
}

/**
 * Fetch weather data with full offline support.
 *
 * Priority order:
 * 1. Fresh cache (< 30 min) — return immediately, no network call
 * 2. Live fetch from edge function — cache result, retry once on failure
 * 3. Stale cache (any age) — return with staleness indicator
 * 4. Synthetic fallback — return with "unavailable" indicator
 *
 * This function NEVER throws. It always returns a WeatherFetchResult
 * with a source indicator and optional error message.
 *
 * @returns WeatherFetchResult with source indicator and optional error
 */
export async function fetchWeatherWithStatus(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric' = 'imperial',
  forceRefresh = false,
): Promise<WeatherFetchResult> {
  if (coordinates.length === 0) {
    return {
      data: { results: [], fetched_at: new Date().toISOString(), units },
      source: 'fallback',
      cachedAt: null,
      error: null,
    };
  }

  const key = coordKey(coordinates);

  // Step 1: Check fresh cache (unless force refresh)
  if (!forceRefresh) {
    const fresh = getCached(key, false);
    if (fresh) {
      return {
        data: fresh.data,
        source: 'cache_fresh',
        cachedAt: fresh.cachedAt,
        error: null,
      };
    }
  }

  // Step 2: Try live fetch (with retry)
  try {
    // Quick connectivity check — skip network call if definitely offline
    if (!connectivity.isOnline()) {
      throw new Error('Device is offline');
    }

    const response = await callWeatherEdgeFunction(coordinates, units);

    // Cache the successful response
    setCache(key, response);

    // Check if any individual waypoints had errors
    const waypointErrors = response.results
      .filter(r => r.error)
      .map(r => r.error);

    return {
      data: response,
      source: 'live',
      cachedAt: Date.now(),
      error: waypointErrors.length > 0
        ? `${waypointErrors.length} waypoint(s) had weather fetch issues`
        : null,
    };
  } catch (fetchErr: any) {
    const errorMsg = fetchErr?.message || 'Failed to fetch weather';
    console.warn('[WeatherStore] Live fetch failed:', errorMsg);

    // Provide more specific error messages for API key issues
    const userFacingError = isApiKeyError(errorMsg)
      ? 'Weather service not configured — OPENWEATHER_API_KEY may be missing or invalid. Contact your administrator.'
      : errorMsg;

    // Step 3: Try stale cache
    const stale = getStaleCached(key);
    if (stale) {
      console.log('[WeatherStore] Returning stale cache from', getWeatherAge(stale.cachedAt));
      return {
        data: stale.data,
        source: 'cache_stale',
        cachedAt: stale.cachedAt,
        error: userFacingError,
      };
    }

    // Step 4: Generate fallback
    console.log('[WeatherStore] No cache available — generating fallback data');
    return {
      data: generateFallbackWeather(coordinates, units),
      source: 'fallback',
      cachedAt: null,
      error: userFacingError,
    };
  }
}

/**
 * Legacy fetch function — maintained for backward compatibility.
 *
 * Prefer fetchWeatherWithStatus() for new code — it never throws
 * and provides source/staleness metadata.
 */
export async function fetchWeather(
  coordinates: WeatherCoordinate[],
  units: 'imperial' | 'metric' = 'imperial',
  forceRefresh = false,
): Promise<WeatherResponse> {
  const result = await fetchWeatherWithStatus(coordinates, units, forceRefresh);
  return result.data;
}

/**
 * Simple single-coordinate fetch — convenience wrapper.
 *
 * Uses the simplified { lat, lon, units } format supported by the edge function:
 *   supabase.functions.invoke("get-weather", { body: { lat, lon, units: "imperial" } })
 *
 * Returns the full WeatherFetchResult with source metadata.
 * This function NEVER throws.
 */
export async function fetchWeatherForLocation(
  lat: number,
  lon: number,
  units: 'imperial' | 'metric' = 'imperial',
): Promise<WeatherFetchResult> {
  const key = singleCoordKey(lat, lon);

  // Step 1: Check fresh cache
  const fresh = getCached(key, false);
  if (fresh) {
    return {
      data: fresh.data,
      source: 'cache_fresh',
      cachedAt: fresh.cachedAt,
      error: null,
    };
  }

  // Step 2: Try live fetch using simple format
  try {
    if (!connectivity.isOnline()) {
      throw new Error('Device is offline');
    }

    const response = await callSimpleWeatherEdgeFunction(lat, lon, units);

    // Cache the successful response
    setCache(key, response);

    const waypointErrors = response.results
      .filter(r => r.error)
      .map(r => r.error);

    return {
      data: response,
      source: 'live',
      cachedAt: Date.now(),
      error: waypointErrors.length > 0
        ? `Weather data partially unavailable`
        : null,
    };
  } catch (fetchErr: any) {
    const errorMsg = fetchErr?.message || 'Failed to fetch weather';
    console.warn('[WeatherStore] Simple fetch failed:', errorMsg);

    const userFacingError = isApiKeyError(errorMsg)
      ? 'Weather service not configured — OPENWEATHER_API_KEY may be missing or invalid.'
      : errorMsg;

    // Step 3: Try stale cache
    const stale = getStaleCached(key);
    if (stale) {
      return {
        data: stale.data,
        source: 'cache_stale',
        cachedAt: stale.cachedAt,
        error: userFacingError,
      };
    }

    // Step 4: Generate fallback
    return {
      data: generateFallbackWeather([{ lat, lng: lon, label: undefined }], units),
      source: 'fallback',
      cachedAt: null,
      error: userFacingError,
    };
  }
}

// ── Cache Query Functions ────────────────────────────────────

/**
 * Get cached weather data (fresh only) for given coordinates.
 * Returns null if no fresh cache exists.
 */
export function getCachedWeather(coordinates: WeatherCoordinate[]): WeatherResponse | null {
  if (coordinates.length === 0) return null;
  const key = coordKey(coordinates);
  const cached = getCached(key, false);
  return cached?.data || null;
}

/**
 * Get any cached weather data (including stale) for given coordinates.
 * Returns null only if no cache exists at all.
 * Includes cachedAt timestamp for staleness display.
 */
export function getAnyCachedWeather(
  coordinates: WeatherCoordinate[],
): { data: WeatherResponse; cachedAt: number } | null {
  if (coordinates.length === 0) return null;
  const key = coordKey(coordinates);
  const cached = getStaleCached(key);
  if (!cached) return null;
  return { data: cached.data, cachedAt: cached.cachedAt };
}

/**
 * Clear all weather cache entries.
 */
export function clearWeatherCache(): void {
  // Clear in-memory cache
  memoryCache.clear();

  // Clear localStorage cache (web only)
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_KEY_PREFIX)) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    }
  } catch {}
}

/**
 * Get total number of cached weather entries and their combined size.
 */
export function getWeatherCacheStats(): { count: number; sizeBytes: number; memoryEntries: number } {
  let lsCount = 0;
  let lsSizeBytes = 0;

  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_KEY_PREFIX)) {
          lsCount++;
          const val = localStorage.getItem(k);
          if (val) lsSizeBytes += val.length * 2; // UTF-16
        }
      }
    }
  } catch {}

  return {
    count: Math.max(lsCount, memoryCache.size),
    sizeBytes: lsSizeBytes,
    memoryEntries: memoryCache.size,
  };
}


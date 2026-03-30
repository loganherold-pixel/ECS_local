/**
 * ══════════════════════════════════════════════════════════════
 * get-weather Edge Function — Specification & Contract
 * ══════════════════════════════════════════════════════════════
 *
 * This file documents the EXACT contract between the client
 * (weatherStore.ts) and the Supabase Edge Function (get-weather).
 *
 * The edge function is deployed at:
 *   supabase/functions/get-weather/index.ts
 *
 * ── API KEY ──────────────────────────────────────────────────
 *
 * Secret name:  OPENWEATHER_API_KEY
 *
 * Set via CLI:
 *   supabase secrets set OPENWEATHER_API_KEY=<your-openweather-api-key>
 *
 * Read in edge function:
 *   const apiKey = Deno.env.get("OPENWEATHER_API_KEY");
 *
 * IMPORTANT:
 *   - NEVER hardcode the API key in client code, edge function code, or the repo
 *   - The key is stored ONLY in Supabase Edge Function secrets
 *   - If the key is missing, the edge function returns:
 *     { error: "Missing OPENWEATHER_API_KEY" } with HTTP 500
 *
 * ── CORS / PREFLIGHT ─────────────────────────────────────────
 *
 * The edge function MUST set these headers on ALL responses:
 *   Access-Control-Allow-Origin: *
 *   Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
 *   Access-Control-Allow-Methods: POST, OPTIONS
 *
 * OPTIONS requests MUST return 200 with CORS headers (no body processing).
 *
 * ── INPUT FORMATS ────────────────────────────────────────────
 *
 * Format 1 — Simple (single coordinate):
 *   POST body: {
 *     lat: number,        // -90 to 90
 *     lon: number,        // -180 to 180
 *     units?: "imperial" | "metric"   // default: "imperial"
 *   }
 *
 * Format 2 — Multi (multiple coordinates):
 *   POST body: {
 *     coordinates: [
 *       { lat: number, lng: number, label?: string },
 *       ...
 *     ],
 *     units?: "imperial" | "metric"   // default: "imperial"
 *   }
 *
 * Note: The multi format uses `lng` (not `lon`) to match the client-side
 * WeatherCoordinate type. The edge function should accept both `lng` and `lon`.
 *
 * ── RESPONSE FORMAT ──────────────────────────────────────────
 *
 * Success (200):
 *   {
 *     results: WaypointWeather[],
 *     fetched_at: string,           // ISO 8601 timestamp
 *     units: "imperial" | "metric",
 *
 *     // Only included for simple (single-coordinate) format:
 *     location?: { lat: number, lon: number },
 *     current?: {
 *       temp: number | null,
 *       feels_like: number | null,
 *       humidity: number | null,
 *       wind_speed: number | null,
 *       wind_deg: number | null,
 *       weather_main: string | null,
 *       weather_desc: string | null,
 *       icon: string | null,
 *     },
 *     updated_at?: string,          // ISO 8601 timestamp
 *   }
 *
 * WaypointWeather shape:
 *   {
 *     lat: number,
 *     lng: number,
 *     label: string | null,
 *     error: string | null,         // null if successful, error message if this waypoint failed
 *     current: CurrentConditions | null,
 *     forecast: DailyForecast[] | null,
 *     alerts: WeatherAlert[],
 *     trail_conditions: TrailConditions | null,
 *   }
 *
 * CurrentConditions shape:
 *   {
 *     temp, feels_like, temp_min, temp_max: number | null,
 *     humidity, pressure, visibility: number | null,
 *     wind_speed, wind_deg, wind_gust: number | null,
 *     clouds: number | null,
 *     weather_id: number | null,
 *     weather_main, weather_description, weather_icon: string | null,
 *     rain_1h, rain_3h, snow_1h, snow_3h: number | null,
 *     sunrise, sunset: number | null,       // Unix timestamps
 *     location_name: string | null,
 *     dt: number | null,                    // Unix timestamp
 *   }
 *
 * DailyForecast shape:
 *   {
 *     date: string,                         // "YYYY-MM-DD"
 *     temp_min, temp_max: number | null,
 *     humidity, pressure: number | null,
 *     wind_max, wind_gust_max: number,
 *     pop: number,                          // precipitation probability 0-100
 *     rain_total, snow_total: number,
 *     weather_id: number | null,
 *     weather_main, weather_description, weather_icon: string,
 *   }
 *
 * WeatherAlert shape:
 *   {
 *     severity: "advisory" | "warning" | "extreme",
 *     title: string,
 *     description: string,
 *     type: string,                         // e.g., "wind", "thunderstorm", "heat"
 *   }
 *
 * TrailConditions shape:
 *   {
 *     overall: "good" | "fair" | "poor" | "hazardous",
 *     factors: [
 *       { factor: string, status: "good"|"caution"|"warning"|"danger", detail: string },
 *       ...
 *     ],
 *   }
 *
 * ── ERROR RESPONSES ──────────────────────────────────────────
 *
 * Missing API key (500):
 *   { error: "Missing OPENWEATHER_API_KEY" }
 *
 * Invalid input (400):
 *   { error: "Invalid request body", details: "..." }
 *
 * OpenWeather fetch failure (502):
 *   { error: "Weather fetch failed", details: "..." }
 *
 * Per-coordinate errors:
 *   When one coordinate fails but others succeed, the failing coordinate
 *   has its `error` field set (non-null) while successful coordinates
 *   have `error: null`. This allows partial results.
 *
 * ── OPENWEATHER API ENDPOINTS USED ───────────────────────────
 *
 * Current Weather:
 *   GET https://api.openweathermap.org/data/2.5/weather
 *     ?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units={units}
 *
 * 5-Day Forecast:
 *   GET https://api.openweathermap.org/data/2.5/forecast
 *     ?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}&units={units}
 *
 * Both endpoints are available on the free OpenWeather tier.
 * The edge function fetches both in parallel for each coordinate,
 * then normalizes and aggregates the data.
 *
 * ── CLIENT INVOCATION ────────────────────────────────────────
 *
 * From Expo Go / React Native:
 *
 *   // Simple format (single location)
 *   const { data, error } = await supabase.functions.invoke('get-weather', {
 *     body: { lat: 36.1069, lon: -112.1129, units: 'imperial' },
 *   });
 *
 *   // Multi format (route waypoints)
 *   const { data, error } = await supabase.functions.invoke('get-weather', {
 *     body: {
 *       coordinates: [
 *         { lat: 36.1069, lng: -112.1129, label: 'Grand Canyon' },
 *         { lat: 37.2753, lng: -108.4618, label: 'Mesa Verde' },
 *       ],
 *       units: 'imperial',
 *     },
 *   });
 *
 * ══════════════════════════════════════════════════════════════
 */

// This file is documentation-only. No runtime exports.
// It exists to document the edge function contract for developers.
export {};


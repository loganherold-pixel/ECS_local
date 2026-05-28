/* eslint-disable import/no-unresolved */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");
const REQUEST_TIMEOUT_MS = 10000;
const HOURLY_LIMIT = 48;
const FORECAST_DAY_LIMIT = 8;
const ONE_CALL_PROVIDER = {
  id: "openweather_one_call_3_0",
  name: "OpenWeather One Call API 3.0",
  endpoint: "https://api.openweathermap.org/data/3.0/onecall",
};

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type Units = "imperial" | "metric";

interface InputCoordinate {
  lat: number;
  lng: number;
  label?: string | null;
}

interface WeatherAlert {
  severity: "advisory" | "warning" | "extreme";
  title: string;
  description: string;
  type: string;
  effective?: string | null;
  expires?: string | null;
}

class WeatherProviderError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "WeatherProviderError";
    this.status = status;
    this.code = code;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toCoordinate(raw: any): InputCoordinate | null {
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng ?? raw?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    label: typeof raw?.label === "string" && raw.label.trim() ? raw.label.trim() : null,
  };
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const text = await response.text().catch(() => "");
    let body: any = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new WeatherProviderError(502, "invalid_json", "Invalid JSON from OpenWeather");
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new WeatherProviderError(401, "openweather_unauthorized", "OpenWeather authentication failed");
      }
      if (response.status === 429) {
        throw new WeatherProviderError(429, "openweather_rate_limited", "OpenWeather rate limit exceeded");
      }
      const providerMessage = typeof body?.message === "string" && body.message
        ? body.message
        : `OpenWeather request failed (${response.status})`;
      throw new WeatherProviderError(response.status, "openweather_error", providerMessage);
    }

    if (!body || typeof body !== "object") {
      throw new WeatherProviderError(502, "invalid_payload", "Malformed OpenWeather payload");
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function currentTempUnit(units: Units) {
  return units === "imperial" ? "F" : "C";
}

function formatTemp(value: number, units: Units) {
  return `${Math.round(value)}°${currentTempUnit(units)}`;
}

function summarizePrecipType(main: string | null, rainTotal: number, snowTotal: number) {
  if (snowTotal > 0 || (main ?? "").toLowerCase().includes("snow")) return "snow";
  if (rainTotal > 0 || /(rain|drizzle|storm)/i.test(main ?? "")) return "rain";
  return "precipitation";
}

function deriveTrailConditions(current: any) {
  const wind = safeNumber(current?.wind_speed);
  const visibility = safeNumber(current?.visibility);
  const weatherMain = String(current?.weather_main ?? "").toLowerCase();
  const temp = safeNumber(current?.temp);

  const factors: Array<{ factor: string; status: "good" | "caution" | "warning" | "danger"; detail: string }> = [];
  let overall: "good" | "fair" | "poor" | "hazardous" = "good";

  const bump = (next: typeof overall) => {
    const order = ["good", "fair", "poor", "hazardous"];
    if (order.indexOf(next) > order.indexOf(overall)) overall = next;
  };

  if (wind != null) {
    if (wind >= 45) {
      factors.push({
        factor: "Wind",
        status: "danger",
        detail: `Sustained winds near ${Math.round(wind)} mph can make exposed trail travel hazardous.`,
      });
      bump("hazardous");
    } else if (wind >= 25) {
      factors.push({
        factor: "Wind",
        status: "warning",
        detail: `Winds near ${Math.round(wind)} mph may reduce control and visibility on open sections.`,
      });
      bump("poor");
    }
  }

  if (visibility != null) {
    if (visibility <= 800) {
      factors.push({
        factor: "Visibility",
        status: "danger",
        detail: "Visibility is critically reduced. Route finding may become unsafe.",
      });
      bump("hazardous");
    } else if (visibility <= 5000) {
      factors.push({
        factor: "Visibility",
        status: "warning",
        detail: "Visibility is reduced. Increase spacing and slow down in terrain transitions.",
      });
      bump("poor");
    }
  }

  if (weatherMain.includes("snow") || weatherMain.includes("thunderstorm")) {
    factors.push({
      factor: "Surface",
      status: "warning",
      detail: `Current ${weatherMain} conditions may degrade traction and increase route risk.`,
    });
    bump("poor");
  } else if (weatherMain.includes("rain") || weatherMain.includes("drizzle")) {
    factors.push({
      factor: "Surface",
      status: "caution",
      detail: `Current ${weatherMain} conditions may soften surfaces and create slick sections.`,
    });
    bump("fair");
  }

  if (temp != null) {
    if (temp >= 105 || temp <= 15) {
      factors.push({
        factor: "Temperature",
        status: "warning",
        detail: `Ambient temperature ${Math.round(temp)} may stress crew and equipment performance.`,
      });
      bump("poor");
    } else if (temp >= 95 || temp <= 32) {
      factors.push({
        factor: "Temperature",
        status: "caution",
        detail: `Ambient temperature ${Math.round(temp)} may reduce comfort and operating margin.`,
      });
      bump("fair");
    }
  }

  if (!factors.length) {
    factors.push({
      factor: "Conditions",
      status: "good",
      detail: "Current trail weather appears within normal operating range.",
    });
  }

  return { overall, factors };
}

function buildCurrentFromOneCall(payload: any, label: string | null) {
  const current = payload?.current ?? {};
  return {
    temp: safeNumber(current?.temp),
    feels_like: safeNumber(current?.feels_like),
    temp_min: null,
    temp_max: null,
    humidity: safeNumber(current?.humidity),
    pressure: safeNumber(current?.pressure),
    uvi: safeNumber(current?.uvi),
    visibility: safeNumber(current?.visibility),
    wind_speed: safeNumber(current?.wind_speed),
    wind_deg: safeNumber(current?.wind_deg),
    wind_gust: safeNumber(current?.wind_gust),
    clouds: safeNumber(current?.clouds),
    weather_id: safeNumber(current?.weather?.[0]?.id),
    weather_main: current?.weather?.[0]?.main ?? null,
    weather_description: current?.weather?.[0]?.description ?? null,
    weather_icon: current?.weather?.[0]?.icon ?? null,
    rain_1h: safeNumber(current?.rain?.["1h"]),
    rain_3h: null,
    snow_1h: safeNumber(current?.snow?.["1h"]),
    snow_3h: null,
    sunrise: safeNumber(current?.sunrise),
    sunset: safeNumber(current?.sunset),
    location_name: label,
    dt: safeNumber(current?.dt),
  };
}

function buildDailyForecastFromOneCall(dailyList: any[]) {
  return (Array.isArray(dailyList) ? dailyList : [])
    .slice(0, FORECAST_DAY_LIMIT)
    .map((day) => {
      const date = typeof day?.dt === "number"
        ? new Date(day.dt * 1000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const weather = day?.weather?.[0] ?? {};
      return {
        date,
        temp_day: safeNumber(day?.temp?.day),
        temp_min: safeNumber(day?.temp?.min),
        temp_max: safeNumber(day?.temp?.max),
        humidity: safeNumber(day?.humidity),
        pressure: safeNumber(day?.pressure),
        wind_max: safeNumber(day?.wind_speed),
        wind_gust_max: safeNumber(day?.wind_gust),
        wind_deg: safeNumber(day?.wind_deg),
        sunrise: safeNumber(day?.sunrise),
        sunset: safeNumber(day?.sunset),
        pop: Math.round(clamp(Number(day?.pop ?? 0), 0, 1) * 100),
        rain_total: safeNumber(day?.rain) ?? 0,
        snow_total: safeNumber(day?.snow) ?? 0,
        weather_id: safeNumber(weather?.id),
        weather_main: weather?.main ?? "Unknown",
        weather_description: weather?.description ?? "Unavailable",
        weather_icon: weather?.icon ?? "01d",
        summary: day?.summary ?? null,
        temp: day?.temp ?? null,
        feels_like: day?.feels_like ?? null,
        rain: safeNumber(day?.rain),
        snow: safeNumber(day?.snow),
        weather: Array.isArray(day?.weather) ? day.weather : [],
      };
    });
}

function buildHourlyForecastFromOneCall(hourlyList: any[]) {
  return (Array.isArray(hourlyList) ? hourlyList : [])
    .slice(0, HOURLY_LIMIT)
    .map((hour) => {
      const weather = hour?.weather?.[0] ?? {};
      return {
        dt: safeNumber(hour?.dt),
        time: typeof hour?.dt === "number" ? new Date(hour.dt * 1000).toISOString() : null,
        temp: safeNumber(hour?.temp),
        feels_like: safeNumber(hour?.feels_like),
        humidity: safeNumber(hour?.humidity),
        pressure: safeNumber(hour?.pressure),
        wind_speed: safeNumber(hour?.wind_speed),
        wind_deg: safeNumber(hour?.wind_deg),
        wind_gust: safeNumber(hour?.wind_gust),
        pop: Math.round(clamp(Number(hour?.pop ?? 0), 0, 1) * 100),
        rain_1h: safeNumber(hour?.rain?.["1h"]),
        snow_1h: safeNumber(hour?.snow?.["1h"]),
        weather_id: safeNumber(weather?.id),
        weather_main: weather?.main ?? "Unknown",
        weather_description: weather?.description ?? "Unavailable",
        weather_icon: weather?.icon ?? "01d",
        weather: Array.isArray(hour?.weather) ? hour.weather : [],
      };
    });
}

function buildAlertsFromOneCall(alertList: any[]): WeatherAlert[] {
  return (Array.isArray(alertList) ? alertList : []).map((alert) => {
    const title = String(alert?.event ?? "Weather Alert");
    const text = `${title} ${String(alert?.description ?? "")}`.toLowerCase();
    const severity: WeatherAlert["severity"] =
      /(extreme|emergency|danger|severe)/.test(text)
        ? "extreme"
        : /(warning|watch)/.test(text)
          ? "warning"
          : "advisory";
    return {
      severity,
      title,
      description: String(alert?.description ?? title),
      type: title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "weather",
      effective: typeof alert?.start === "number" ? new Date(alert.start * 1000).toISOString() : null,
      expires: typeof alert?.end === "number" ? new Date(alert.end * 1000).toISOString() : null,
    };
  });
}

function deriveAlerts(current: any, dailyForecast: any[], units: Units): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const temp = safeNumber(current?.temp);
  const wind = safeNumber(current?.wind_speed) ?? 0;
  const gust = safeNumber(current?.wind_gust) ?? 0;
  const visibility = safeNumber(current?.visibility);
  const weatherId = safeNumber(current?.weather_id);
  const condition = current?.weather_main ?? null;
  const precipChance = safeNumber(dailyForecast?.[0]?.pop) ?? 0;
  const rainTotal = safeNumber(dailyForecast?.[0]?.rain_total) ?? 0;
  const snowTotal = safeNumber(dailyForecast?.[0]?.snow_total) ?? 0;
  const expires = dailyForecast?.[0]?.date ? new Date(`${dailyForecast[0].date}T18:00:00.000Z`).toISOString() : null;

  const pushAlert = (alert: WeatherAlert) => {
    if (alerts.some(existing => existing.title === alert.title && existing.severity === alert.severity)) return;
    alerts.push(alert);
  };

  if (wind >= 55 || gust >= 70) {
    pushAlert({
      severity: "extreme",
      title: "Extreme Wind Warning",
      description: "Dangerous winds may affect vehicle control and exposed route travel.",
      type: "wind",
      effective: new Date().toISOString(),
      expires,
    });
  } else if (wind >= 40 || gust >= 55) {
    pushAlert({
      severity: "warning",
      title: "High Wind Advisory",
      description: "Strong winds are likely to impact route stability and visibility.",
      type: "wind",
      effective: new Date().toISOString(),
      expires,
    });
  } else if (wind >= 25 || gust >= 35) {
    pushAlert({
      severity: "advisory",
      title: "Breezy Route Conditions",
      description: "Crosswinds may affect comfort and dust conditions on exposed sections.",
      type: "wind",
      effective: new Date().toISOString(),
      expires,
    });
  }

  if (visibility != null && visibility <= 800) {
    pushAlert({
      severity: "warning",
      title: "Low Visibility Warning",
      description: "Visibility is critically reduced. Use caution in route-finding terrain.",
      type: "visibility",
      effective: new Date().toISOString(),
      expires,
    });
  } else if (visibility != null && visibility <= 5000) {
    pushAlert({
      severity: "advisory",
      title: "Reduced Visibility",
      description: "Visibility is degraded and may conceal terrain changes or traffic hazards.",
      type: "visibility",
      effective: new Date().toISOString(),
      expires,
    });
  }

  if (weatherId != null && weatherId >= 200 && weatherId < 300) {
    pushAlert({
      severity: "warning",
      title: "Thunderstorm Risk",
      description: "Electrical storm activity may affect route safety and exposed stops.",
      type: "thunderstorm",
      effective: new Date().toISOString(),
      expires,
    });
  }

  if (precipChance >= 80 && (rainTotal >= 10 || snowTotal >= 5)) {
    pushAlert({
      severity: snowTotal > 0 ? "warning" : "advisory",
      title: snowTotal > 0 ? "Snow Along Route" : "Heavy Precipitation Ahead",
      description: `${Math.round(precipChance)}% precipitation chance in the short forecast. Expect slower progress.`,
      type: summarizePrecipType(condition, rainTotal, snowTotal),
      effective: new Date().toISOString(),
      expires,
    });
  }

  if (temp != null) {
    const hotWarning = units === "imperial" ? 105 : 40;
    const hotAdvisory = units === "imperial" ? 95 : 35;
    const coldWarning = units === "imperial" ? 15 : -9;
    const coldAdvisory = units === "imperial" ? 32 : 0;

    if (temp >= hotWarning) {
      pushAlert({
        severity: "warning",
        title: "Extreme Heat",
        description: `Current temperature ${formatTemp(temp, units)} may reduce crew endurance and vehicle margin.`,
        type: "heat",
        effective: new Date().toISOString(),
        expires,
      });
    } else if (temp >= hotAdvisory) {
      pushAlert({
        severity: "advisory",
        title: "Hot Operating Conditions",
        description: `Current temperature ${formatTemp(temp, units)} may increase water and cooling demand.`,
        type: "heat",
        effective: new Date().toISOString(),
        expires,
      });
    }

    if (temp <= coldWarning) {
      pushAlert({
        severity: "warning",
        title: "Extreme Cold",
        description: `Current temperature ${formatTemp(temp, units)} may affect traction, crew exposure, and batteries.`,
        type: "cold",
        effective: new Date().toISOString(),
        expires,
      });
    } else if (temp <= coldAdvisory) {
      pushAlert({
        severity: "advisory",
        title: "Cold Conditions",
        description: `Current temperature ${formatTemp(temp, units)} may reduce comfort and equipment performance.`,
        type: "cold",
        effective: new Date().toISOString(),
        expires,
      });
    }
  }

  return alerts;
}

async function fetchCoordinateWeather(coord: InputCoordinate, units: Units) {
  const params = new URLSearchParams({
    lat: String(coord.lat),
    lon: String(coord.lng),
    units,
    exclude: "minutely",
    appid: OPENWEATHER_API_KEY ?? "",
  });
  const oneCallData = await fetchJson(`${ONE_CALL_PROVIDER.endpoint}?${params.toString()}`);

  const current = buildCurrentFromOneCall(oneCallData, coord.label ?? null);
  const hourly = buildHourlyForecastFromOneCall(oneCallData?.hourly ?? []);
  const daily = buildDailyForecastFromOneCall(oneCallData?.daily ?? []);
  const forecast = daily;
  const providerAlerts = buildAlertsFromOneCall(oneCallData?.alerts ?? []);
  const alerts = providerAlerts.length ? providerAlerts : deriveAlerts(current, forecast, units);

  return {
    lat: coord.lat,
    lng: coord.lng,
    coordinates: { lat: coord.lat, lon: coord.lng, lng: coord.lng },
    label: coord.label ?? null,
    error: null,
    current,
    hourly,
    daily,
    forecast,
    alerts,
    timezone: oneCallData?.timezone ?? null,
    timezone_offset: safeNumber(oneCallData?.timezone_offset),
    units,
    fetchedAt: new Date().toISOString(),
    provider: ONE_CALL_PROVIDER,
    trail_conditions: deriveTrailConditions(current),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (!OPENWEATHER_API_KEY) {
    return json({ error: "Missing OPENWEATHER_API_KEY" }, 500);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request body", details: "JSON body required" }, 400);
    }

    const rawCoordinates = Array.isArray((body as any).coordinates)
      ? (body as any).coordinates
      : (body as any).lat != null && ((body as any).lon != null || (body as any).lng != null)
        ? [{ lat: (body as any).lat, lng: (body as any).lng ?? (body as any).lon, label: (body as any).label ?? null }]
        : [];

    const coordinates = rawCoordinates
      .map(toCoordinate)
      .filter((coord): coord is InputCoordinate => coord != null)
      .slice(0, 12);

    if (!coordinates.length) {
      return json({ error: "Invalid request body", details: "At least one valid coordinate is required" }, 400);
    }

    const units: Units = (body as any).units === "metric" ? "metric" : "imperial";

    const results = await Promise.all(
      coordinates.map(async (coord) => {
        try {
          return await fetchCoordinateWeather(coord, units);
        } catch (error) {
          const providerError = error instanceof WeatherProviderError ? error : null;
          return {
            lat: coord.lat,
            lng: coord.lng,
            label: coord.label ?? null,
            error: error instanceof Error ? error.message : "Weather fetch failed",
            provider_status: providerError?.status ?? 502,
            provider_error_code: providerError?.code ?? "weather_fetch_failed",
            current: null,
            hourly: [],
            daily: [],
            forecast: [],
            alerts: [],
            timezone: null,
            timezone_offset: null,
            units,
            fetchedAt: new Date().toISOString(),
            provider: ONE_CALL_PROVIDER,
            trail_conditions: null,
          };
        }
      }),
    );

    const errors = results
      .filter(result => typeof result.error === "string" && result.error)
      .map(result => {
        const providerStatus = "provider_status" in result ? result.provider_status : 502;
        const providerCode = "provider_error_code" in result ? result.provider_error_code : "weather_fetch_failed";
        return {
          lat: result.lat,
          lon: result.lng,
          label: result.label ?? null,
          status: providerStatus ?? 502,
          code: providerCode ?? "weather_fetch_failed",
          message: result.error,
        };
      });

    if (errors.length === results.length) {
      const first = errors[0];
      // Provider failures are returned as a structured weather payload so the
      // mobile app can open Weather and show an honest unavailable state.
      // Request/configuration failures above still return non-2xx statuses.
      return json({
        error: "Weather provider error",
        details: first?.message ?? "Weather fetch failed",
        results,
        fetched_at: new Date().toISOString(),
        units,
        provider: ONE_CALL_PROVIDER.id,
        provider_metadata: ONE_CALL_PROVIDER,
        errors,
      });
    }

    const payload: Record<string, unknown> = {
      results,
      fetched_at: new Date().toISOString(),
      units,
      provider: ONE_CALL_PROVIDER.id,
      provider_metadata: ONE_CALL_PROVIDER,
      errors,
    };

    if (coordinates.length === 1) {
      const first = results[0];
      payload.location = { lat: coordinates[0].lat, lon: coordinates[0].lng };
      payload.current = first?.current ?? null;
      payload.updated_at = payload.fetched_at;
    }

    return json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return json({ error: "Weather fetch failed", details: message }, 500);
  }
});

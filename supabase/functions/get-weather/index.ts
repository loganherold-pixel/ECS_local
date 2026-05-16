/* eslint-disable import/no-unresolved */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");
const OPENWEATHER_PREFER_ONECALL_3 = Deno.env.get("OPENWEATHER_PREFER_ONECALL_3") !== "false";
const REQUEST_TIMEOUT_MS = 10000;
const FORECAST_DAY_LIMIT = 16;

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

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof body?.message === "string" && body.message
          ? body.message
          : `Weather provider error (${response.status})`;
      throw new Error(message);
    }

    if (!body || typeof body !== "object") {
      throw new Error("Malformed weather provider payload");
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

function buildCurrent(currentData: any, label: string | null) {
  return {
    temp: safeNumber(currentData?.main?.temp),
    feels_like: safeNumber(currentData?.main?.feels_like),
    temp_min: safeNumber(currentData?.main?.temp_min),
    temp_max: safeNumber(currentData?.main?.temp_max),
    humidity: safeNumber(currentData?.main?.humidity),
    pressure: safeNumber(currentData?.main?.pressure),
    visibility: safeNumber(currentData?.visibility),
    wind_speed: safeNumber(currentData?.wind?.speed),
    wind_deg: safeNumber(currentData?.wind?.deg),
    wind_gust: safeNumber(currentData?.wind?.gust),
    clouds: safeNumber(currentData?.clouds?.all),
    weather_id: safeNumber(currentData?.weather?.[0]?.id),
    weather_main: currentData?.weather?.[0]?.main ?? null,
    weather_description: currentData?.weather?.[0]?.description ?? null,
    weather_icon: currentData?.weather?.[0]?.icon ?? null,
    rain_1h: safeNumber(currentData?.rain?.["1h"]),
    rain_3h: safeNumber(currentData?.rain?.["3h"]),
    snow_1h: safeNumber(currentData?.snow?.["1h"]),
    snow_3h: safeNumber(currentData?.snow?.["3h"]),
    sunrise: safeNumber(currentData?.sys?.sunrise),
    sunset: safeNumber(currentData?.sys?.sunset),
    location_name: currentData?.name ?? label,
    dt: safeNumber(currentData?.dt),
  };
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

function buildDailyForecast(forecastList: any[]) {
  const byDay = new Map<string, any[]>();

  for (const item of Array.isArray(forecastList) ? forecastList : []) {
    const key =
      typeof item?.dt_txt === "string"
        ? item.dt_txt.slice(0, 10)
        : typeof item?.dt === "number"
          ? new Date(item.dt * 1000).toISOString().slice(0, 10)
          : null;
    if (!key) continue;
    const bucket = byDay.get(key) ?? [];
    bucket.push(item);
    byDay.set(key, bucket);
  }

  return Array.from(byDay.entries())
    .slice(0, FORECAST_DAY_LIMIT)
    .map(([date, entries]) => {
      const tempsMin = entries.map(item => safeNumber(item?.main?.temp_min)).filter((value): value is number => value != null);
      const tempsMax = entries.map(item => safeNumber(item?.main?.temp_max)).filter((value): value is number => value != null);
      const humidities = entries.map(item => safeNumber(item?.main?.humidity)).filter((value): value is number => value != null);
      const pressures = entries.map(item => safeNumber(item?.main?.pressure)).filter((value): value is number => value != null);
      const temps = entries.map(item => safeNumber(item?.main?.temp)).filter((value): value is number => value != null);
      const winds = entries.map(item => safeNumber(item?.wind?.speed) ?? 0);
      const gusts = entries.map(item => safeNumber(item?.wind?.gust) ?? 0);
      const windDirections = entries.map(item => safeNumber(item?.wind?.deg)).filter((value): value is number => value != null);
      const pops = entries.map(item => clamp(Number(item?.pop ?? 0), 0, 1));
      const rainTotal = entries.reduce((sum, item) => sum + (safeNumber(item?.rain?.["3h"]) ?? 0), 0);
      const snowTotal = entries.reduce((sum, item) => sum + (safeNumber(item?.snow?.["3h"]) ?? 0), 0);
      const noonish = entries.find(item => typeof item?.dt_txt === "string" && item.dt_txt.includes("12:00:00")) ?? entries[0];

      return {
        date,
        temp_day: temps.length ? Math.round(temps.reduce((sum, value) => sum + value, 0) / temps.length) : null,
        temp_min: tempsMin.length ? Math.round(Math.min(...tempsMin)) : null,
        temp_max: tempsMax.length ? Math.round(Math.max(...tempsMax)) : null,
        humidity: humidities.length ? Math.round(humidities.reduce((sum, value) => sum + value, 0) / humidities.length) : null,
        pressure: pressures.length ? Math.round(pressures.reduce((sum, value) => sum + value, 0) / pressures.length) : null,
        wind_max: Math.round(Math.max(...winds)),
        wind_gust_max: Math.round(Math.max(...gusts)),
        wind_deg: windDirections.length ? Math.round(windDirections.reduce((sum, value) => sum + value, 0) / windDirections.length) : null,
        pop: Math.round(Math.max(...pops) * 100),
        rain_total: Number(rainTotal.toFixed(1)),
        snow_total: Number(snowTotal.toFixed(1)),
        weather_id: safeNumber(noonish?.weather?.[0]?.id),
        weather_main: noonish?.weather?.[0]?.main ?? "Unknown",
        weather_description: noonish?.weather?.[0]?.description ?? "Unavailable",
        weather_icon: noonish?.weather?.[0]?.icon ?? "01d",
      };
    });
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
  if (OPENWEATHER_PREFER_ONECALL_3) {
    try {
      const oneCallUrl =
        `https://api.openweathermap.org/data/3.0/onecall?lat=${coord.lat}&lon=${coord.lng}` +
        `&units=${units}&appid=${OPENWEATHER_API_KEY}`;
      const oneCallData = await fetchJson(oneCallUrl);
      const current = buildCurrentFromOneCall(oneCallData, coord.label ?? null);
      const forecast = buildDailyForecastFromOneCall(oneCallData?.daily ?? []);
      const providerAlerts = buildAlertsFromOneCall(oneCallData?.alerts ?? []);
      const alerts = providerAlerts.length ? providerAlerts : deriveAlerts(current, forecast, units);

      return {
        lat: coord.lat,
        lng: coord.lng,
        label: coord.label ?? null,
        error: null,
        current,
        forecast,
        alerts,
        trail_conditions: deriveTrailConditions(current),
      };
    } catch {
      // Fall through to the existing OpenWeather 2.5 current + forecast provider path.
    }
  }

  const currentUrl =
    `https://api.openweathermap.org/data/2.5/weather?lat=${coord.lat}&lon=${coord.lng}` +
    `&units=${units}&appid=${OPENWEATHER_API_KEY}`;
  const forecastUrl =
    `https://api.openweathermap.org/data/2.5/forecast?lat=${coord.lat}&lon=${coord.lng}` +
    `&units=${units}&appid=${OPENWEATHER_API_KEY}`;

  const [currentData, forecastData] = await Promise.all([
    fetchJson(currentUrl),
    fetchJson(forecastUrl),
  ]);

  const current = buildCurrent(currentData, coord.label ?? null);
  const forecast = buildDailyForecast(forecastData?.list ?? []);
  const alerts = deriveAlerts(current, forecast, units);

  return {
    lat: coord.lat,
    lng: coord.lng,
    label: coord.label ?? null,
    error: null,
    current,
    forecast,
    alerts,
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
          return {
            lat: coord.lat,
            lng: coord.lng,
            label: coord.label ?? null,
            error: error instanceof Error ? error.message : "Weather fetch failed",
            current: null,
            forecast: [],
            alerts: [],
            trail_conditions: null,
          };
        }
      }),
    );

    const payload: Record<string, unknown> = {
      results,
      fetched_at: new Date().toISOString(),
      units,
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

/**
 * Weather Intelligence Types
 * 
 * Type definitions for weather data used throughout the ECS weather panel.
 */

export interface WeatherCoordinate {
  lat: number;
  lng: number;
  label?: string;
}

export interface CurrentConditions {
  temp: number | null;
  feels_like: number | null;
  temp_min: number | null;
  temp_max: number | null;
  humidity: number | null;
  pressure: number | null;
  visibility: number | null;
  wind_speed: number | null;
  wind_deg: number | null;
  wind_gust: number | null;
  clouds: number | null;
  weather_id: number | null;
  weather_main: string | null;
  weather_description: string | null;
  weather_icon: string | null;
  rain_1h: number | null;
  rain_3h: number | null;
  snow_1h: number | null;
  snow_3h: number | null;
  sunrise: number | null;
  sunset: number | null;
  location_name: string | null;
  dt: number | null;
}

export interface DailyForecast {
  date: string;
  temp_min: number | null;
  temp_max: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_max: number;
  wind_gust_max: number;
  pop: number; // precipitation probability %
  rain_total: number;
  snow_total: number;
  weather_id: number | null;
  weather_main: string;
  weather_description: string;
  weather_icon: string;
}

export type TrailFactorStatus = 'good' | 'caution' | 'warning' | 'danger';
export type TrailOverall = 'good' | 'fair' | 'poor' | 'hazardous';

export interface TrailFactor {
  factor: string;
  status: TrailFactorStatus;
  detail: string;
}

export interface TrailConditions {
  overall: TrailOverall;
  factors: TrailFactor[];
}

export type AlertSeverity = 'advisory' | 'warning' | 'extreme';

export interface WeatherAlert {
  severity: AlertSeverity;
  title: string;
  description: string;
  type: string;
}

export interface WaypointWeather {
  lat: number;
  lng: number;
  label: string | null;
  error: string | null;
  current: CurrentConditions | null;
  forecast: DailyForecast[] | null;
  alerts: WeatherAlert[];
  trail_conditions: TrailConditions | null;
}

export interface WeatherResponse {
  results: WaypointWeather[];
  fetched_at: string;
  units: 'imperial' | 'metric';
}

export interface CachedWeather {
  data: WeatherResponse;
  cachedAt: number;
  coordKey: string;
}

// Weather icon mapping for Ionicons
export function getWeatherIcon(weatherMain: string | null, weatherId: number | null): string {
  if (!weatherMain) return 'cloud-outline';
  
  const main = weatherMain.toLowerCase();
  
  if (weatherId != null) {
    if (weatherId >= 200 && weatherId < 300) return 'thunderstorm-outline';
    if (weatherId >= 300 && weatherId < 400) return 'rainy-outline';
    if (weatherId >= 500 && weatherId < 600) return 'rainy-outline';
    if (weatherId >= 600 && weatherId < 700) return 'snow-outline';
    if (weatherId >= 700 && weatherId < 800) return 'eye-off-outline'; // fog/haze
    if (weatherId === 800) return 'sunny-outline';
    if (weatherId === 801) return 'partly-sunny-outline';
    if (weatherId >= 802) return 'cloud-outline';
  }
  
  switch (main) {
    case 'clear': return 'sunny-outline';
    case 'clouds': return 'cloud-outline';
    case 'rain': case 'drizzle': return 'rainy-outline';
    case 'thunderstorm': return 'thunderstorm-outline';
    case 'snow': return 'snow-outline';
    case 'mist': case 'fog': case 'haze': return 'eye-off-outline';
    default: return 'cloud-outline';
  }
}

export function getWindDirection(deg: number | null): string {
  if (deg == null) return '--';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function getAlertColor(severity: AlertSeverity | string): string {
  switch (severity) {
    case 'extreme': return '#EF5350';
    case 'warning': return '#FFB300';
    case 'advisory': return '#42A5F5';
    default: return '#8A8A85';
  }
}

export function getTrailStatusColor(status: TrailFactorStatus): string {
  switch (status) {
    case 'good': return '#66BB6A';
    case 'caution': return '#FFB300';
    case 'warning': return '#FF7043';
    case 'danger': return '#EF5350';
    default: return '#8A8A85';
  }
}

export function getTrailOverallColor(overall: TrailOverall): string {
  switch (overall) {
    case 'good': return '#66BB6A';
    case 'fair': return '#FFB300';
    case 'poor': return '#FF7043';
    case 'hazardous': return '#EF5350';
    default: return '#8A8A85';
  }
}


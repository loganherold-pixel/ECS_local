const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const edgeFunction = fs.readFileSync(path.join(root, 'supabase', 'functions', 'get-weather', 'index.ts'), 'utf8');
const weatherStore = fs.readFileSync(path.join(root, 'lib', 'weatherStore.ts'), 'utf8');
const weatherTypes = fs.readFileSync(path.join(root, 'lib', 'weatherTypes.ts'), 'utf8');
const ecsWeather = fs.readFileSync(path.join(root, 'lib', 'ecsWeather.ts'), 'utf8');

assert(edgeFunction.includes('Deno.env.get("OPENWEATHER_API_KEY")'), 'Edge function should read OPENWEATHER_API_KEY only from Supabase/Deno env.');
assert(edgeFunction.includes('https://api.openweathermap.org/data/3.0/onecall'), 'Edge function should call OpenWeather One Call API 3.0.');
assert(!edgeFunction.includes('https://api.openweathermap.org/data/2.5/weather'), 'Edge function should not call the basic current weather endpoint.');
assert(!edgeFunction.includes('https://api.openweathermap.org/data/2.5/forecast'), 'Edge function should not call the basic forecast endpoint.');
assert(edgeFunction.includes('exclude: "minutely"'), 'One Call requests should exclude minutely data.');
assert(edgeFunction.includes('buildHourlyForecastFromOneCall'), 'Edge function should normalize hourly forecast rows.');
assert(edgeFunction.includes('slice(0, HOURLY_LIMIT)'), 'Hourly forecast should be capped.');
assert(edgeFunction.includes('slice(0, FORECAST_DAY_LIMIT)'), 'Daily forecast should be capped.');
assert(edgeFunction.includes('OpenWeather authentication failed'), 'OpenWeather 401 should be handled clearly.');
assert(edgeFunction.includes('OpenWeather rate limit exceeded'), 'OpenWeather 429 should be handled clearly.');
assert(edgeFunction.includes('Invalid JSON from OpenWeather'), 'Invalid OpenWeather JSON should be handled clearly.');
assert(edgeFunction.includes('At least one valid coordinate is required'), 'Invalid coordinates should return a clear 400 path.');
assert(edgeFunction.includes('Provider failures are returned as a structured weather payload'), 'Provider failures should let Weather open with unavailable states instead of a generic function error.');
assert(edgeFunction.includes('results,'), 'All-provider-failure payload should still include normalized result rows.');
assert(edgeFunction.includes('raw?.lng ?? raw?.lon'), 'Coordinate parser should accept lng and lon.');
assert(edgeFunction.includes('provider_metadata'), 'Response should include provider metadata.');
assert(edgeFunction.includes('timezone_offset'), 'Response should include timezone offset.');

assert(weatherStore.includes('const CACHE_DURATION_MS = 10 * 60 * 1000'), 'Weather store should use a 10-minute live cache window.');
assert(weatherStore.includes('normalizeHourlyList'), 'Weather store should normalize hourly weather from the edge response.');
assert(weatherStore.includes('provider: typeof data?.provider'), 'Weather store should preserve provider metadata key.');
assert(weatherTypes.includes('export interface HourlyForecast'), 'Weather types should expose HourlyForecast.');
assert(ecsWeather.includes('hourly: Array.isArray(raw?.hourly)'), 'ECS weather snapshot should pass through hourly rows.');

console.log('OpenWeather One Call edge function checks passed');

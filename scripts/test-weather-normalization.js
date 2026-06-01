const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(output.outputText, fullPath);
  return mod.exports;
}

const {
  formatWeatherDegrees,
  normalizeWeatherTemperatureF,
  normalizeTemperatureF,
  normalizeWindSpeed,
} = loadTypeScriptModule('lib/weatherNormalization.ts');

const {
  buildECSWeatherSnapshot,
  formatWeatherHeadline,
  formatWeatherWindLine,
  getCurrentWeatherTemperatureF,
} = loadTypeScriptModule('lib/ecsWeather.ts');
const {
  buildUnifiedWeatherCorridor,
} = loadTypeScriptModule('lib/weatherSurfaceSelectors.ts');

function hasMojibake(value) {
  return /[ÂÃâ�]/.test(value);
}

assert.strictEqual(Math.round(normalizeWindSpeed(10, 'mps')), 22, 'm/s wind should convert to mph');
assert.strictEqual(normalizeWindSpeed(10, 'mph'), 10, 'mph wind should stay mph');
assert.strictEqual(Math.round(normalizeWindSpeed(10, 'knots')), 12, 'knots should convert to mph');
assert.strictEqual(Math.round(normalizeTemperatureF(20, 'metric')), 68, 'Celsius should convert to Fahrenheit in normalized shape');
assert.strictEqual(normalizeWeatherTemperatureF({ temp_f: 74 }, 'metric'), 74, 'explicit temp_f should stay Fahrenheit');
assert.strictEqual(Math.round(normalizeWeatherTemperatureF({ temperature_2m: 21 }, 'metric')), 70, 'temperature_2m should normalize from metric units');
assert.strictEqual(normalizeWeatherTemperatureF({ airTemperature: 66 }, 'imperial'), 66, 'airTemperature should normalize from response units');
assert.strictEqual(formatWeatherDegrees(72), '72°', 'degree formatter should emit a clean degree symbol');
assert.strictEqual(formatWeatherDegrees(null), '--°', 'degree formatter should expose a truthful unavailable marker');

const liveSnapshot = buildECSWeatherSnapshot({
  result: {
    source: 'live',
    cachedAt: Date.now(),
    error: null,
    data: {
      fetched_at: '2026-04-25T12:00:00.000Z',
      units: 'imperial',
      results: [
        {
          lat: 39,
          lng: -120,
          label: 'Sierra Test',
          error: null,
          current: {
            temp: 72,
            feels_like: 70,
            temp_min: 64,
            temp_max: 78,
            humidity: 35,
            pressure: 1012,
            visibility: 10000,
            wind_speed: 14,
            wind_deg: 270,
            wind_gust: 22,
            clouds: 10,
            weather_id: 800,
            weather_main: 'Clear',
            weather_description: 'clear sky',
            weather_icon: '01d',
            rain_1h: null,
            rain_3h: null,
            snow_1h: null,
            snow_3h: null,
            sunrise: 1777132800,
            sunset: 1777183200,
            location_name: 'Sierra Test',
            dt: null,
          },
          forecast: [
            {
              date: '2026-04-25',
              temp_min: 60,
              temp_max: 76,
              humidity: 30,
              pressure: 1012,
              wind_max: 18,
              wind_gust_max: 28,
              wind_deg: 270,
              pop: 20,
              rain_total: 0,
              snow_total: 0,
              weather_id: 800,
              weather_main: 'Clear',
              weather_description: 'clear sky',
              weather_icon: '01d',
            },
          ],
          alerts: [],
          trail_conditions: { overall: 'good', factors: [] },
        },
      ],
    },
  },
  sourceType: 'current_location',
});

assert.strictEqual(liveSnapshot.normalized.source, 'live');
assert.strictEqual(liveSnapshot.normalized.current.temperatureF, 72);
assert.strictEqual(liveSnapshot.normalized.current.tempF, 72);
assert.strictEqual(liveSnapshot.normalized.current.temperature, 72);
assert.strictEqual(liveSnapshot.current.temp, 72);
assert.strictEqual(getCurrentWeatherTemperatureF(liveSnapshot), 72);
assert.strictEqual(liveSnapshot.normalized.current.feelsLikeF, 70);
assert.strictEqual(liveSnapshot.normalized.current.windMph, 14);
assert.strictEqual(liveSnapshot.normalized.current.windGustMph, 22);
assert.strictEqual(liveSnapshot.normalized.current.windDirectionDeg, 270);
assert.strictEqual(liveSnapshot.normalized.current.pressureHpa, 1012);
assert.strictEqual(liveSnapshot.normalized.current.sunrise, 1777132800);
assert.strictEqual(liveSnapshot.normalized.current.sunset, 1777183200);
assert.strictEqual(liveSnapshot.normalized.current.highTemperatureF, 78);
assert.strictEqual(liveSnapshot.normalized.current.lowTemperatureF, 64);
assert.strictEqual(liveSnapshot.normalized.forecast.length, 1);
assert.strictEqual(liveSnapshot.normalized.forecast[0].temperatureF, 76);
assert.strictEqual(liveSnapshot.normalized.forecast[0].highTemperatureF, 76);
assert.strictEqual(liveSnapshot.normalized.forecast[0].lowTemperatureF, 60);
assert.strictEqual(liveSnapshot.normalized.forecast[0].windMph, 18);
assert.strictEqual(liveSnapshot.normalized.forecast[0].windGustMph, 28);
assert.strictEqual(liveSnapshot.normalized.forecast[0].windDirectionDeg, 270);
assert(!hasMojibake(formatWeatherHeadline(liveSnapshot)), 'headline must not contain mojibake');
assert(!hasMojibake(formatWeatherWindLine(liveSnapshot)), 'wind line must not contain mojibake');

const calmWindSnapshot = buildECSWeatherSnapshot({
  result: {
    source: 'live',
    cachedAt: Date.now(),
    error: null,
    data: {
      fetched_at: '2026-04-25T12:00:00.000Z',
      units: 'imperial',
      results: [{
        lat: 39,
        lng: -120,
        label: 'Calm Wind',
        error: null,
        current: {
          temp: 0,
          wind_speed: 0,
          pressure: 0,
          weather_main: 'Clear',
        },
        forecast: [],
        alerts: [],
        trail_conditions: null,
      }],
    },
  },
  sourceType: 'current_location',
});
assert.strictEqual(calmWindSnapshot.normalized.current.temperatureF, 0, 'zero-degree temperatures should remain valid weather values');
assert.strictEqual(calmWindSnapshot.normalized.current.windMph, 0, 'calm wind at 0 mph should remain a valid weather value');
assert.strictEqual(calmWindSnapshot.normalized.current.pressureHpa, 0, 'zero pressure should be preserved by normalization when explicitly supplied');
assert.strictEqual(calmWindSnapshot.current.windSpeed, 0, 'canonical current weather should preserve 0 mph wind');

const unifiedSurface = buildUnifiedWeatherCorridor({
  snapshot: liveSnapshot,
  result: {
    source: 'live',
    cachedAt: Date.now(),
    error: null,
    data: {
      fetched_at: '2026-04-25T12:00:00.000Z',
      units: 'imperial',
      results: liveSnapshot.raw ? [liveSnapshot.raw] : [],
    },
  },
});

assert.strictEqual(unifiedSurface.windMph, 14);
assert.strictEqual(unifiedSurface.windGustMph, 22);
assert.strictEqual(unifiedSurface.windDirectionDeg, 270);
assert.strictEqual(unifiedSurface.windDirectionLabel, 'W');
assert.strictEqual(unifiedSurface.forecast.length, 1);
assert.strictEqual(unifiedSurface.forecast[0].wind_gust_max, 28);

const staleSnapshot = buildECSWeatherSnapshot({
  result: {
    source: 'cache_stale',
    cachedAt: Date.now() - 3 * 60 * 60 * 1000,
    error: 'Device is offline',
    data: liveSnapshot.raw
      ? {
          fetched_at: '2026-04-25T09:00:00.000Z',
          units: 'imperial',
          results: [liveSnapshot.raw],
        }
      : { fetched_at: null, units: 'imperial', results: [] },
  },
  sourceType: 'current_location',
});

assert.strictEqual(staleSnapshot.normalized.source, 'cache');
assert.strictEqual(staleSnapshot.sourceType, 'cached');
assert.strictEqual(getCurrentWeatherTemperatureF(staleSnapshot), 72);
assert(!hasMojibake(staleSnapshot.status.label || ''), 'cached status label must not contain mojibake');

const tempFShapeSnapshot = buildECSWeatherSnapshot({
  result: {
    source: 'live',
    cachedAt: Date.now(),
    error: null,
    data: {
      fetched_at: '2026-04-25T13:00:00.000Z',
      units: 'imperial',
      results: [{
        lat: 39,
        lng: -120,
        label: 'TempF Shape',
        error: null,
        current: {
          temp_f: 81,
          weather_main: 'Clouds',
          wind_speed: 8,
        },
        forecast: [],
        alerts: [],
        trail_conditions: null,
      }],
    },
  },
  sourceType: 'current_location',
});

assert.strictEqual(tempFShapeSnapshot.normalized.current.temperatureF, 81);
assert.strictEqual(tempFShapeSnapshot.current.temp, 81);
assert.strictEqual(getCurrentWeatherTemperatureF(tempFShapeSnapshot), 81);

const metricTemperatureShapeSnapshot = buildECSWeatherSnapshot({
  result: {
    source: 'cache_fresh',
    cachedAt: Date.now(),
    error: null,
    data: {
      fetched_at: '2026-04-25T13:05:00.000Z',
      units: 'metric',
      results: [{
        lat: 39,
        lng: -120,
        label: 'Metric Shape',
        error: null,
        current: {
          temperature_2m: 20,
          weather_main: 'Clear',
          wind_speed: 5,
        },
        forecast: [],
        alerts: [],
        trail_conditions: null,
      }],
    },
  },
  sourceType: 'current_location',
});

assert.strictEqual(metricTemperatureShapeSnapshot.normalized.source, 'cache');
assert.strictEqual(Math.round(metricTemperatureShapeSnapshot.normalized.current.temperatureF), 68);
assert.strictEqual(Math.round(metricTemperatureShapeSnapshot.current.temp), 68);
assert.strictEqual(Math.round(getCurrentWeatherTemperatureF(metricTemperatureShapeSnapshot)), 68);

const airTemperatureShapeSnapshot = buildECSWeatherSnapshot({
  result: {
    source: 'live',
    cachedAt: Date.now(),
    error: null,
    data: {
      fetched_at: '2026-04-25T13:10:00.000Z',
      units: 'imperial',
      results: [{
        lat: 39,
        lng: -120,
        label: 'Air Temp Shape',
        error: null,
        current: {
          airTemperature: 64,
          weather_description: 'fair',
          wind_speed: 6,
        },
        forecast: [],
        alerts: [],
        trail_conditions: null,
      }],
    },
  },
  sourceType: 'current_location',
});

assert.strictEqual(airTemperatureShapeSnapshot.normalized.current.temperatureF, 64);
assert.strictEqual(airTemperatureShapeSnapshot.current.temp, 64);
assert.strictEqual(getCurrentWeatherTemperatureF(airTemperatureShapeSnapshot), 64);

const aliasForecast = Array.from({ length: 16 }, (_, index) => ({
  date: `2026-05-${String(index + 1).padStart(2, '0')}`,
  high: 80 + index,
  low: 55 + index,
  sunrise: 1777132800 + index * 86400,
  sunset: 1777183200 + index * 86400,
  windSpeed: 10 + index,
  windGust: 18 + index,
  precipChance: index,
  condition: index % 2 === 0 ? 'Sunny' : 'Cloudy',
}));

const aliasShapeSnapshot = buildECSWeatherSnapshot({
  result: {
    source: 'live',
    cachedAt: Date.now(),
    error: null,
    data: {
      fetched_at: '2026-04-25T14:00:00.000Z',
      units: 'imperial',
      results: [{
        lat: 34,
        lng: -118,
        label: 'Alias Shape',
        error: null,
        current: {
          temperatureF: 74,
          tempHigh: 86,
          tempLow: 59,
          windSpeed: 11,
          windGust: 24,
          sunup: 1777132800,
          sundown: 1777183200,
          condition: 'Sunny',
          weather_main: 'Sunny',
        },
        forecast: aliasForecast,
        alerts: [],
        trail_conditions: null,
      }],
    },
  },
  sourceType: 'current_location',
});

assert.strictEqual(aliasShapeSnapshot.current.windGust, 24, 'current windGust alias should map to canonical gust');
assert.strictEqual(aliasShapeSnapshot.current.highTemperature, 86, 'current tempHigh alias should map to today high');
assert.strictEqual(aliasShapeSnapshot.current.lowTemperature, 59, 'current tempLow alias should map to today low');
assert.strictEqual(aliasShapeSnapshot.current.sunrise, 1777132800, 'current sunup alias should map to sunrise');
assert.strictEqual(aliasShapeSnapshot.current.sunset, 1777183200, 'current sundown alias should map to sunset');
assert.strictEqual(aliasShapeSnapshot.normalized.forecast.length, 16, 'normalized forecast should keep available days up to 16');
assert.strictEqual(aliasShapeSnapshot.normalized.forecast[0].highTemperatureF, 80, 'forecast high alias should map to highTemperatureF');
assert.strictEqual(aliasShapeSnapshot.normalized.forecast[0].lowTemperatureF, 55, 'forecast low alias should map to lowTemperatureF');
assert.strictEqual(aliasShapeSnapshot.normalized.forecast[0].sunrise, 1777132800, 'forecast sunrise should map to normalized forecast sunrise');
assert.strictEqual(aliasShapeSnapshot.normalized.forecast[0].sunset, 1777183200, 'forecast sunset should map to normalized forecast sunset');
assert.strictEqual(aliasShapeSnapshot.normalized.forecast[0].windGustMph, 18, 'forecast windGust alias should map to gust');
assert.strictEqual(aliasShapeSnapshot.normalized.forecast[3].precipitationChance, 3, 'forecast precipChance alias should map to precipitation chance');

const shortForecastSnapshot = buildECSWeatherSnapshot({
  result: {
    source: 'live',
    cachedAt: Date.now(),
    error: null,
    data: {
      fetched_at: '2026-04-25T14:05:00.000Z',
      units: 'imperial',
      results: [{
        lat: 34,
        lng: -118,
        label: 'Short Forecast',
        error: null,
        current: { temperatureF: 73, weather_main: 'Clouds' },
        forecast: aliasForecast.slice(0, 2),
        alerts: [],
        trail_conditions: null,
      }],
    },
  },
  sourceType: 'current_location',
});

assert.strictEqual(shortForecastSnapshot.normalized.forecast.length, 2, 'short forecasts should render available rows only');
assert.strictEqual(shortForecastSnapshot.current.sunrise, 1777132800, 'current sunrise should fall back to today forecast sunrise');
assert.strictEqual(shortForecastSnapshot.current.sunset, 1777183200, 'current sunset should fall back to today forecast sunset');

const weatherStoreSource = fs.readFileSync(path.join(process.cwd(), 'lib/weatherStore.ts'), 'utf8');
assert(
  weatherStoreSource.includes('dailyColumnarForecastToList') &&
    weatherStoreSource.includes('temperature_2m_max') &&
    weatherStoreSource.includes('temperature_2m_min') &&
    weatherStoreSource.includes('pressure_msl_mean') &&
    weatherStoreSource.includes('surface_pressure_mean') &&
    weatherStoreSource.includes('normalizeTimestampSeconds'),
  'weather normalization must support live daily/16-day columnar forecast pressure, high/low, sunrise, and sunset shapes',
);
assert(
  weatherStoreSource.includes('temp.max') &&
    weatherStoreSource.includes('temp.min') &&
    weatherStoreSource.includes('temperature.max') &&
    weatherStoreSource.includes('temperature.min') &&
    weatherStoreSource.includes('tempHigh') &&
    weatherStoreSource.includes('tempLow') &&
    weatherStoreSource.includes('forecastDays') &&
    weatherStoreSource.includes('dailyForecast') &&
    weatherStoreSource.includes('sunup') &&
    weatherStoreSource.includes('sundown'),
  'weather normalization must support nested and alias provider forecast/current fields',
);

const weatherPanelSource = fs.readFileSync(path.join(process.cwd(), 'components/weather/WeatherIntelPanel.tsx'), 'utf8');
assert(
  weatherPanelSource.includes('Derived from live weather') &&
    weatherPanelSource.includes('weatherSnapshot.normalized.current?.pressureHpa') &&
    weatherPanelSource.includes('weatherSnapshot.normalized.current?.sunrise') &&
    weatherPanelSource.includes('weatherSnapshot.normalized.current?.sunset') &&
    weatherPanelSource.includes('weatherSnapshot.normalized.forecast') &&
    weatherPanelSource.includes('todayForecast?.temp_min') &&
    weatherPanelSource.includes('todayForecast?.temp_max') &&
    weatherPanelSource.includes('normalizeSunTimestampSeconds(todayForecast?.sunrise)') &&
    weatherPanelSource.includes('normalizeSunTimestampSeconds(todayForecast?.sunset)') &&
    weatherPanelSource.includes('hydratedForecast.slice(0, 16)'),
  'weather intelligence panel must expose live/cache trail provenance and hydrate injected pressure/sun times plus normalized forecast high/low/sun times',
);

const currentConditionsSource = fs.readFileSync(path.join(process.cwd(), 'components/weather/CurrentConditionsCard.tsx'), 'utf8');
assert(
  currentConditionsSource.includes('function formatTemperatureValue') &&
    currentConditionsSource.includes('function formatSunEventTime') &&
    currentConditionsSource.includes('function normalizePressureHpa') &&
    currentConditionsSource.includes('icon="reorder-three-outline"') &&
    currentConditionsSource.includes('icon="pulse-outline"') &&
    currentConditionsSource.includes('icon="water-outline"') &&
    currentConditionsSource.includes('icon="eye-outline"') &&
    !currentConditionsSource.includes('icon="speedometer-outline"') &&
    !currentConditionsSource.includes('icon="cellular-outline"') &&
    currentConditionsSource.includes('formatTemperatureValue(conditions.temp_max)') &&
    currentConditionsSource.includes('formatTemperatureValue(conditions.temp_min)') &&
    currentConditionsSource.includes('formatSunEventTime(conditions.sunrise)') &&
    currentConditionsSource.includes('formatSunEventTime(conditions.sunset)') &&
    currentConditionsSource.includes('const pressureHpa = normalizePressureHpa(conditions.pressure)') &&
    currentConditionsSource.includes('{pressureHpa != null && (') &&
    !currentConditionsSource.includes('value={conditions.pressure != null ? `${conditions.pressure}` : \'--\'}'),
  'current conditions card must render high/low temperatures, sun times, and pressure with defensive value formatting',
);

const forecastTimelineSource = fs.readFileSync(path.join(process.cwd(), 'components/weather/ForecastTimeline.tsx'), 'utf8');
assert(
  forecastTimelineSource.includes('day.temp_day') &&
    forecastTimelineSource.includes('dayTempText') &&
    forecastTimelineSource.includes('function formatForecastTemperature') &&
    forecastTimelineSource.includes('const dailyLow = finiteTemperature(day.temp_min)') &&
    forecastTimelineSource.includes('const dailyHigh = finiteTemperature(day.temp_max)') &&
    forecastTimelineSource.includes('formatForecastTemperature(dailyLow)') &&
    forecastTimelineSource.includes('formatForecastTemperature(dailyHigh)') &&
    !forecastTimelineSource.includes('precipNone'),
  'forecast timeline must show a daily temperature plus high/low range when live forecast values exist without unexplained precip placeholders',
);

const widgetRendererSource = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/WidgetRenderers.tsx'), 'utf8');
assert(
  widgetRendererSource.includes('getNormalizedForecastDays') &&
    widgetRendererSource.includes('TODAY HIGH') &&
    widgetRendererSource.includes('TODAY LOW') &&
    widgetRendererSource.includes('SUNUP') &&
    widgetRendererSource.includes('SUNDOWN') &&
    widgetRendererSource.includes('slice(0, 16)'),
  'dashboard weather detail must consume normalized forecast/current high-low and sun fields',
);

const previousDevFlag = global.__DEV__;
const previousWeatherDebugFlag = global.__ECS_DEBUG_WEATHER;
const originalConsoleLog = console.log;
const weatherLogs = [];
global.__DEV__ = true;
console.log = (...args) => {
  weatherLogs.push(args);
};
try {
  buildECSWeatherSnapshot({
    result: {
      source: 'live',
      cachedAt: Date.now(),
      error: null,
      data: {
        results: [{
          lat: 39,
          lng: -120,
          label: 'Structured Log Test',
          error: null,
          current: {
            temp: 70,
            wind_speed: 6.91,
            weather_main: 'Clear',
          },
          forecast: [{
            date: '2026-04-25',
            temp_max: 76,
            temp_min: 60,
            weather_main: 'Clear',
          }],
          alerts: [],
          trail_conditions: null,
        }],
        fetched_at: '2026-04-25T15:00:00.000Z',
        units: 'imperial',
      },
    },
    sourceType: 'current_location',
  });
  assert.strictEqual(
    weatherLogs.length,
    0,
    'weather normalization logs should stay quiet unless ECS weather debug logging is explicitly enabled',
  );

  global.__ECS_DEBUG_WEATHER = true;
  buildECSWeatherSnapshot({
    result: {
      source: 'live',
      cachedAt: Date.now(),
      error: null,
      data: {
        results: [{
          lat: 39,
          lng: -120,
          label: 'Structured Debug Log Test',
          error: null,
          current: {
            temp: 70,
            wind_speed: 7.13,
            weather_main: 'Clear',
          },
          forecast: [{
            date: '2026-04-25',
            temp_max: 76,
            temp_min: 60,
            weather_main: 'Clear',
          }],
          alerts: [],
          trail_conditions: null,
        }],
        fetched_at: '2026-04-25T15:00:00.000Z',
        units: 'imperial',
      },
    },
    sourceType: 'current_location',
  });
} finally {
  console.log = originalConsoleLog;
  if (typeof previousDevFlag === 'undefined') {
    delete global.__DEV__;
  } else {
    global.__DEV__ = previousDevFlag;
  }
  if (typeof previousWeatherDebugFlag === 'undefined') {
    delete global.__ECS_DEBUG_WEATHER;
  } else {
    global.__ECS_DEBUG_WEATHER = previousWeatherDebugFlag;
  }
}

const normalizeInputLog = weatherLogs.find((args) => args[0] === '[WEATHER]' && args[1] === 'normalize_input');
const normalizeOutputLog = weatherLogs.find((args) => args[0] === '[WEATHER]' && args[1] === 'normalize_output');
assert.deepStrictEqual(
  normalizeInputLog,
  ['[WEATHER]', 'normalize_input', { keys: ['results', 'fetched_at', 'units'] }],
  'weather normalize input debug log should use a structured keys array payload',
);
assert.deepStrictEqual(
  normalizeOutputLog,
  ['[WEATHER]', 'normalize_output', { hasCurrent: true, hasForecast: true, windMph: 7.13 }],
  'weather normalize output debug log should use a consistent structured payload',
);

console.log('weather normalization tests passed');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function registerTypeScriptLoader() {
  require.extensions['.ts'] = function loadTs(module, filename) {
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
}

function loadTypeScriptModule(relPath) {
  const fullPath = path.join(process.cwd(), relPath);
  return require(fullPath);
}

registerTypeScriptLoader();

const { buildWeatherEvents } = loadTypeScriptModule('lib/dispatchLiveAggregator.ts');
const { validateDispatchEvent } = loadTypeScriptModule('lib/dispatchLiveEvents.ts');
const dispatchChannelStateSource = fs
  .readFileSync(path.join(process.cwd(), 'lib', 'dispatchChannelState.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

function captureLogs(fn) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    return { value: fn(), logs };
  } finally {
    console.log = originalLog;
  }
}

const freshFetchedAt = new Date().toISOString();

const baseWeather = {
  locationName: 'Ridge Camp',
  fetchedAt: freshFetchedAt,
  status: {
    source: 'live',
    stale: false,
  },
  current: {
    windSpeed: 8,
    visibility: 10000,
    condition: 'Clear',
  },
  raw: {
    lat: 39.1234,
    lng: -120.4567,
    label: 'Ridge Camp',
    current: {
      wind_speed: 8,
      visibility: 10000,
      weather_main: 'Clear',
    },
    trail_conditions: {
      overall: 'good',
      factors: [],
    },
  },
};

const severeAlertEvents = buildWeatherEvents({
  ...baseWeather,
  alerts: [
    {
      title: 'Severe Thunderstorm Warning',
      type: 'storm',
      severity: 'warning',
      effective: '2026-04-26T12:01:00.000Z',
      description: 'Thunderstorms may impact the active route corridor.',
    },
  ],
});
assert.strictEqual(severeAlertEvents.length, 1, 'severe weather alert should create one dispatch event');
assert.strictEqual(severeAlertEvents[0].type, 'weather');
assert.strictEqual(severeAlertEvents[0].severity, 'warning');
assert.strictEqual(severeAlertEvents[0].source, 'weather_engine');
assert.deepStrictEqual(severeAlertEvents[0].location, {
  latitude: 39.1234,
  longitude: -120.4567,
  accuracyMeters: null,
  altitude: null,
  heading: null,
  timestamp: undefined,
  source: undefined,
});
assert(validateDispatchEvent(severeAlertEvents[0]).ok, 'weather alert event should pass Dispatch validation');

const alertWithoutCurrent = buildWeatherEvents({
  locationName: 'Ridge Camp',
  fetchedAt: '2026-04-26T12:00:00.000Z',
  status: { source: 'cache_fresh', stale: false },
  alerts: [
    {
      title: 'Flood Advisory',
      type: 'flood',
      severity: 'advisory',
      description: 'Flood advisory remains active near the route.',
    },
  ],
  raw: {
    lat: 39.1234,
    lng: -120.4567,
  },
});
assert.strictEqual(alertWithoutCurrent.length, 1, 'valid alert should create an event even without current conditions');
assert.strictEqual(alertWithoutCurrent[0].severity, 'watch', 'advisory alerts should become watch events');
assert.strictEqual(alertWithoutCurrent[0].source, 'cache', 'fresh cache weather events should use cache source');

const stable = captureLogs(() => buildWeatherEvents(baseWeather));
assert.strictEqual(stable.value.length, 0, 'stable weather should not create dispatch events');
assert(
  stable.logs.some(line => line.includes('no_alerts')),
  'stable weather should log no_alerts instead of silently reporting count zero',
);
assert(
  !stable.logs.some(line => line.includes('missing_weather')),
  'stable legacy weather should not be treated as missing',
);

const normalizedSnapshotWeather = captureLogs(() => buildWeatherEvents({
  locationName: 'Current Position',
  fetchedAt: freshFetchedAt,
  status: {
    source: 'live',
    stale: false,
    freshness: 'fresh',
    label: 'Live weather',
  },
  current: {
    windSpeed: 1.01,
    visibility: 10000,
    condition: 'Clear',
    description: 'Clear sky',
    precipChance: 5,
  },
  normalized: {
    current: {
      windMph: 1.01,
      condition: 'Clear',
      precipitationChance: 5,
    },
    updatedAt: freshFetchedAt,
  },
  raw: {
    lat: 38.781,
    lng: -121.208,
    label: 'Current Position',
    current: {
      wind_speed: 1.01,
      visibility: 10000,
      weather_main: 'Clear',
      weather_description: 'Clear sky',
    },
    forecast: [{ dt: 1 }],
    trail_conditions: {
      overall: 'good',
      factors: [],
    },
  },
}));
assert.strictEqual(normalizedSnapshotWeather.value.length, 0, 'calm normalized ECS weather should not create dispatch events');
assert(
  normalizedSnapshotWeather.logs.some(line => line.includes('no_alerts')),
  'calm normalized ECS weather should report no_alerts, not missing_weather',
);
assert(
  !normalizedSnapshotWeather.logs.some(line => line.includes('missing_weather')),
  'normalized ECS weather snapshot with current/forecast should not be treated as missing',
);

const modernEcsSnapshotWeather = captureLogs(() => buildWeatherEvents({
  locationName: 'Current Position',
  fetchedAt: freshFetchedAt,
  status: {
    source: 'live',
    stale: false,
    freshness: 'fresh',
    label: 'Live weather',
  },
  current: {
    temp: 68,
    windSpeed: 1.01,
    visibility: 10000,
    condition: 'Clear',
  },
  normalized: {
    current: {
      tempF: 68,
      temperatureF: 68,
      windMph: 1.01,
      condition: 'Clear',
      precipitationChance: 5,
    },
    forecast: [{ time: '2026-04-26', temperatureF: 71 }],
    updatedAt: freshFetchedAt,
  },
  daily: [{ date: '2026-04-26', weather_main: 'Clear' }],
  raw: null,
}));
assert.strictEqual(modernEcsSnapshotWeather.value.length, 0, 'modern ECS weather snapshot should not create calm dispatch events');
assert(
  modernEcsSnapshotWeather.logs.some(line => line.includes('no_alerts')),
  'modern ECS weather snapshot should report no_alerts',
);
assert(
  !modernEcsSnapshotWeather.logs.some(line => line.includes('missing_weather')),
  'modern ECS weather snapshot with normalized forecast should not be treated as missing',
);

const cachedSnapshotWeather = captureLogs(() => buildWeatherEvents({
  locationName: 'Current Position',
  fetchedAt: freshFetchedAt,
  status: {
    source: 'cache_stale',
    stale: true,
    freshness: 'stale',
    label: 'Cached weather',
  },
  normalized: {
    current: {
      tempF: 66,
      windMph: 4,
      condition: 'Partly cloudy',
    },
    forecast: [{ time: '2026-04-26', temperatureF: 69 }],
    updatedAt: freshFetchedAt,
  },
  raw: null,
}));
assert.strictEqual(cachedSnapshotWeather.value.length, 0, 'cached calm weather should not create dispatch events');
assert(
  !cachedSnapshotWeather.logs.some(line => line.includes('missing_weather')),
  'cached ECS weather with normalized current should not be treated as missing',
);

const adaptedWeatherWithoutSource = captureLogs(() => buildWeatherEvents({
  locationName: 'Current Position',
  fetchedAt: freshFetchedAt,
  status: {
    source: null,
    stale: false,
    label: 'Weather available',
  },
  normalized: {
    current: {
      tempF: 64,
      windMph: 3,
      condition: 'Clear',
    },
    forecast: [{ time: '2026-04-26', temperatureF: 68 }],
    updatedAt: freshFetchedAt,
  },
  raw: null,
}));
assert.strictEqual(adaptedWeatherWithoutSource.value.length, 0, 'adapted normalized weather without a legacy source should not create calm dispatch events');
assert(
  !adaptedWeatherWithoutSource.logs.some(line => line.includes('missing_weather')),
  'normalized weather without a legacy source should still be treated as available',
);

assert(
  dispatchChannelStateSource.includes('function getDispatchWeatherStateFromShared()'),
  'Dispatch should adapt shared normalized weather before building live weather events.',
);
assert(
  dispatchChannelStateSource.includes('const firstResult = snapshot.raw ?? result?.data?.results?.[0] ?? null;'),
  'Dispatch weather adapter should fall back from normalized snapshot raw data to WeatherFetchResult results.',
);
assert(
  dispatchChannelStateSource.includes('weatherState = getDispatchWeatherStateFromShared()'),
  'Dispatch live event input should use the stable shared weather adapter.',
);

const windEvents = buildWeatherEvents({
  ...baseWeather,
  current: {
    ...baseWeather.current,
    windSpeed: 42,
  },
  raw: {
    ...baseWeather.raw,
    current: {
      ...baseWeather.raw.current,
      wind_speed: 42,
    },
  },
});
assert.strictEqual(windEvents.length, 1, 'severe wind should create a weather event');
assert.strictEqual(windEvents[0].severity, 'critical');

const duplicateAlerts = captureLogs(() => buildWeatherEvents({
  ...baseWeather,
  alerts: [
    {
      title: 'High Wind Warning',
      type: 'wind',
      severity: 'warning',
      effective: '2026-04-26T12:01:00.000Z',
      description: 'High winds along the ridge.',
    },
    {
      title: 'High Wind Warning',
      type: 'wind',
      severity: 'warning',
      effective: '2026-04-26T12:01:00.000Z',
      description: 'High winds along the ridge.',
    },
  ],
}));
assert.strictEqual(duplicateAlerts.value.length, 1, 'duplicate weather alerts should be suppressed');
assert(
  duplicateAlerts.logs.some(line => line.includes('duplicate_suppressed')),
  'duplicate weather suppression should be logged',
);

const missing = captureLogs(() => buildWeatherEvents(null));
assert.strictEqual(missing.value.length, 0, 'missing weather should create zero events');
assert(missing.logs.some(line => line.includes('missing_weather')), 'missing weather should log missing_weather');

console.log('dispatch weather event checks passed');

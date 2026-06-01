const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

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

const root = process.cwd();
const {
  buildSharedWeatherBriefAdvisories,
} = require(path.join(root, 'lib/weatherBriefAdvisoryEngine.ts'));
const {
  publishSharedWeatherBriefAdvisories,
  resetSharedWeatherBriefPublisherForTests,
  SHARED_WEATHER_BRIEF_COOLDOWN_MS,
} = require(path.join(root, 'lib/weatherBriefPublisher.ts'));
const { briefCadLogStore } = require(path.join(root, 'lib/briefCadLogStore.ts'));

function makeSnapshot(overrides = {}) {
  return {
    locationName: 'Ridge Camp',
    location: {
      lat: 39.1234,
      lng: -120.4567,
      label: 'Ridge Camp',
      sourceType: 'current_location',
      confidence: 0.86,
      labelConfidence: 'high',
      accuracyM: 18,
      stale: false,
      staleReason: null,
    },
    fetchedAt: '2026-05-05T16:00:00.000Z',
    sourceType: 'current_location',
    provider: {
      id: 'ecs_weather',
      name: 'ECS Weather Pipeline',
      source: 'live',
      units: 'imperial',
    },
    cache: {
      fetchedAt: '2026-05-05T16:00:00.000Z',
      cachedAt: Date.parse('2026-05-05T16:00:00.000Z'),
      cacheAgeMs: 0,
      freshness: 'fresh',
    },
    cacheAgeMs: 0,
    locationConfidence: 0.86,
    normalized: {
      current: {
        tempF: 72,
        windMph: 8,
        condition: 'Clear',
        precipitationChance: 5,
      },
      forecast: [],
      updatedAt: '2026-05-05T16:00:00.000Z',
    },
    current: {
      temp: 72,
      feelsLike: 72,
      condition: 'Clear',
      description: 'Clear sky',
      windSpeed: 8,
      windGust: null,
      humidity: 20,
      precipChance: 5,
      precipType: null,
      visibility: 10000,
    },
    alerts: [],
    hourly: [],
    daily: [{ date: '2026-05-05', weather_main: 'Clear' }],
    status: {
      kind: 'live',
      loading: false,
      source: 'live',
      error: null,
      stale: false,
      freshness: 'fresh',
      ageMinutes: 0,
      timestampMs: Date.parse('2026-05-05T16:00:00.000Z'),
      cachedAt: null,
      label: 'Live weather',
    },
    raw: {
      lat: 39.1234,
      lng: -120.4567,
      label: 'Ridge Camp',
      current: {
        temp: 72,
        wind_speed: 8,
        visibility: 10000,
        weather_main: 'Clear',
        weather_description: 'Clear sky',
      },
      forecast: [],
      alerts: [],
    },
    ...overrides,
  };
}

let advisories = buildSharedWeatherBriefAdvisories(makeSnapshot());
assert.strictEqual(advisories.length, 0, 'calm shared weather should not generate ECS Brief advisories');

advisories = buildSharedWeatherBriefAdvisories(makeSnapshot({
  current: {
    temp: 72,
    feelsLike: 72,
    condition: 'Thunderstorm',
    description: 'Thunderstorm with gusty wind',
    windSpeed: 38,
    windGust: 44,
    humidity: 20,
    precipChance: 80,
    precipType: 'rain',
    visibility: 900,
  },
  alerts: [
    {
      title: 'Severe Thunderstorm Warning',
      type: 'storm',
      severity: 'warning',
      effective: '2026-05-05T16:00:00.000Z',
      expires: '2026-05-05T17:00:00.000Z',
      description: 'Storms may affect the route area.',
    },
    {
      title: 'Severe Thunderstorm Warning',
      type: 'storm',
      severity: 'warning',
      effective: '2026-05-05T16:00:00.000Z',
      expires: '2026-05-05T17:00:00.000Z',
      description: 'Storms may affect the route area.',
    },
  ],
}));
assert.strictEqual(advisories.length, 3, 'shared weather advisories should be meaningful and bounded');
assert(advisories.every((item) => item.title === 'WEATHER ADVISORY'), 'advisory copy should stay concise and tactical');
assert(advisories.some((item) => item.kind === 'severe_alert'), 'severe weather alerts should publish');
assert(advisories.some((item) => item.kind === 'high_wind'), 'high wind should publish');
assert(advisories.some((item) => item.kind === 'storm_condition' || item.kind === 'visibility_risk'), 'storm or visibility risk should publish when provider supports it');
assert(advisories.every((item) => item.message.includes('Forecast indicates')), 'weather copy should avoid overstating certainty');
assert(advisories.every((item) => item.recommendedAction.includes('Source freshness: live')), 'advisories should include source freshness');
assert(!advisories.some((item) => /road risk|fire risk|air quality/i.test(`${item.message} ${item.recommendedAction}`)), 'shared weather advisories must not claim unconfigured road/fire/air-quality risk');

const staleSnapshot = makeSnapshot({
  status: {
    kind: 'stale',
    loading: false,
    source: 'cache_stale',
    error: null,
    stale: true,
    freshness: 'stale',
    ageMinutes: 240,
    timestampMs: Date.parse('2026-05-05T12:00:00.000Z'),
    cachedAt: Date.parse('2026-05-05T12:00:00.000Z'),
    label: 'Stale weather',
  },
  current: {
    temp: 102,
    feelsLike: 104,
    condition: 'Clear',
    description: 'Hot',
    windSpeed: 42,
    windGust: 48,
    humidity: 14,
    precipChance: 0,
    precipType: null,
    visibility: 10000,
  },
});
advisories = buildSharedWeatherBriefAdvisories(staleSnapshot);
assert(advisories.length > 0, 'stale weather may still generate labeled advisories');
assert(advisories.every((item) => item.freshness === 'stale'), 'stale advisories should expose stale freshness');
assert(advisories.every((item) => item.severity !== 'critical' && item.severity !== 'warning'), 'stale data should not generate urgent new advisories');
assert(advisories.every((item) => item.message.startsWith('Stale weather advisory')), 'stale copy should be explicit');

resetSharedWeatherBriefPublisherForTests();
briefCadLogStore.clear();
let result = publishSharedWeatherBriefAdvisories(makeSnapshot({
  current: {
    temp: 28,
    feelsLike: 27,
    condition: 'Snow',
    description: 'Light snow',
    windSpeed: 8,
    windGust: null,
    humidity: 64,
    precipChance: 75,
    precipType: 'snow',
    visibility: 2500,
  },
}), { now: 1_000_000 });
assert.strictEqual(result.emitted > 0, true, 'publisher should emit meaningful shared weather advisories');
let entries = briefCadLogStore.getEntries();
assert.strictEqual(entries.length, result.emitted);
assert(entries.every((entry) => entry.source === 'ecs-shared-weather'), 'ECS Brief entries should be tagged as shared weather');
assert(entries.every((entry) => entry.message.includes('Weather advisory')), 'published entries should use tactical weather advisory copy');

result = publishSharedWeatherBriefAdvisories(makeSnapshot({
  current: {
    temp: 28,
    feelsLike: 27,
    condition: 'Snow',
    description: 'Light snow',
    windSpeed: 8,
    windGust: null,
    humidity: 64,
    precipChance: 75,
    precipType: 'snow',
    visibility: 2500,
  },
}), { now: 1_000_000 + 60_000 });
assert.strictEqual(result.emitted, 0, 'publisher should suppress repeated weather advisories inside the cooldown');
assert.strictEqual(briefCadLogStore.getEntries().length, entries.length, 'suppressed advisories should not spam ECS Brief');

result = publishSharedWeatherBriefAdvisories(makeSnapshot({
  current: {
    temp: 28,
    feelsLike: 27,
    condition: 'Snow',
    description: 'Light snow',
    windSpeed: 8,
    windGust: null,
    humidity: 64,
    precipChance: 75,
    precipType: 'snow',
    visibility: 2500,
  },
}), { now: 1_000_000 + SHARED_WEATHER_BRIEF_COOLDOWN_MS + 1 });
assert.strictEqual(result.emitted > 0, true, 'publisher should allow advisories after the cooldown expires');

const dispatchCadSource = fs.readFileSync(path.join(root, 'components/dispatch/DispatchCadCommandCenter.tsx'), 'utf8');
assert(dispatchCadSource.includes('useOperationalWeather'), 'Dispatch CAD should register a shared weather consumer');
assert(dispatchCadSource.includes('publishSharedWeatherBriefAdvisories(dispatchWeather.snapshot)'), 'Dispatch CAD should publish deduped shared weather brief advisories');

const dispatchChannelSource = fs.readFileSync(path.join(root, 'lib/dispatchChannelState.ts'), 'utf8');
assert(dispatchChannelSource.includes('getSharedOperationalWeatherState'), 'Dispatch Intel should read the shared ECS weather snapshot');
assert(dispatchChannelSource.includes('Shared ECS Weather'), 'Dispatch Intel should label the shared weather source');

const cadLogSource = fs.readFileSync(path.join(root, 'components/dashboard/MissionBriefCadLog.tsx'), 'utf8');
assert(cadLogSource.includes("'ecs-shared-weather'"), 'ECS Brief CAD log should render shared weather entries as weather entries');

console.log('Dispatch shared weather brief checks passed.');

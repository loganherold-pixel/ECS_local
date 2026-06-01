const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..');

require.extensions['.ts'] = function compileTs(module, filename) {
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

const {
  normalizeWeatherForecastRows,
} = require(path.join(root, 'lib', 'dashboardWeatherForecastRows.ts'));

function withCapturedWarnings(callback) {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    const result = callback();
    return { result, warnings };
  } finally {
    console.warn = originalWarn;
  }
}

const scope = {
  widgetType: 'attitude-command-weather',
  sourceType: 'route_origin',
  provider: 'openweather',
  locationName: 'Mojave Road',
};

const formatter = {
  label: (day, index) => `Forecast ${day.time.slice(5, 10).replace('-', '/') || index + 1}`,
  value: (day) => `${day.condition} | ${day.highTemperatureF}/${day.lowTemperatureF}`,
};

function renderForecastRowKeys(days, scopeOverride = scope) {
  return normalizeWeatherForecastRows(days, scopeOverride, formatter).map((row) => ({
    key: row.key,
    stableId: row.stableId,
    label: row.label,
    value: row.value,
  }));
}

const duplicateLabelRows = normalizeWeatherForecastRows(
  [
    {
      time: '2026-05-03T06:00:00Z',
      condition: 'Clear',
      highTemperatureF: 76,
      lowTemperatureF: 50,
    },
    {
      time: '2026-05-03T06:00:00Z',
      condition: 'Wind',
      highTemperatureF: 72,
      lowTemperatureF: 48,
    },
  ],
  scope,
  formatter,
);

assert.deepStrictEqual(
  duplicateLabelRows.map((row) => row.label),
  ['Forecast 05/03', 'Forecast 05/03'],
  'Fixture should reproduce duplicate display labels.',
);
assert.strictEqual(new Set(duplicateLabelRows.map((row) => row.key)).size, 2, 'Duplicate display labels must have unique keys.');
assert.ok(
  duplicateLabelRows[1].key.endsWith('|occurrence-2'),
  'Distinct rows with the same stable key fields should get a deterministic occurrence suffix.',
);
assert.ok(
  !duplicateLabelRows.some((row) => row.key.includes('Forecast 05/03')),
  'React keys must not be built from display labels.',
);
assert.strictEqual(
  new Set(duplicateLabelRows.map((row) => row.stableId)).size,
  duplicateLabelRows.length,
  'weatherForecastRows should never contain duplicate stable row ids.',
);

const sameLabelDifferentLocationRows = normalizeWeatherForecastRows(
  [
    {
      time: '2026-05-03T06:00:00Z',
      locationId: 'trailhead-west',
      condition: 'Clear',
      highTemperatureF: 76,
      lowTemperatureF: 50,
    },
    {
      time: '2026-05-03T06:00:00Z',
      locationId: 'camp-east',
      condition: 'Clear',
      highTemperatureF: 76,
      lowTemperatureF: 50,
    },
  ],
  scope,
  formatter,
);

assert.deepStrictEqual(
  sameLabelDifferentLocationRows.map((row) => row.label),
  ['Forecast 05/03', 'Forecast 05/03'],
  'Different locations may legitimately share a display label.',
);
assert.strictEqual(sameLabelDifferentLocationRows.length, 2, 'Different forecast locations should both render.');
assert.strictEqual(
  new Set(sameLabelDifferentLocationRows.map((row) => row.stableId)).size,
  2,
  'Different locations with the same display label must have distinct stable ids.',
);

const sameLabelDifferentPeriodRows = normalizeWeatherForecastRows(
  [
    {
      time: '2026-05-03T06:00:00Z',
      period: 'morning',
      condition: 'Clear',
      highTemperatureF: 76,
      lowTemperatureF: 50,
    },
    {
      time: '2026-05-03T18:00:00Z',
      period: 'evening',
      condition: 'Clear',
      highTemperatureF: 76,
      lowTemperatureF: 50,
    },
  ],
  scope,
  formatter,
);

assert.strictEqual(sameLabelDifferentPeriodRows.length, 2, 'Different forecast windows should both render.');
assert.strictEqual(
  new Set(sameLabelDifferentPeriodRows.map((row) => row.stableId)).size,
  2,
  'Different periods with the same display label must have distinct stable ids.',
);

const { result: identicalRows, warnings: identicalWarnings } = withCapturedWarnings(() =>
  normalizeWeatherForecastRows(
    [
      {
        time: '2026-05-03T06:00:00Z',
        sourceShape: 'normalized.forecast',
        sourceState: 'live',
        condition: 'Clear',
        highTemperatureF: 76,
        lowTemperatureF: 50,
      },
      {
        time: '2026-05-03T06:00:00Z',
        sourceShape: 'daily.forecast',
        sourceState: 'cached',
        condition: 'Clear',
        highTemperatureF: 76,
        lowTemperatureF: 50,
      },
    ],
    scope,
    formatter,
  ),
);

assert.strictEqual(identicalRows.length, 1, 'Exact duplicate rows from cache/live merge should be deduped before render.');
assert.strictEqual(identicalWarnings.length, 1, 'Duplicate source rows should be reported once in dev logging.');
assert.strictEqual(
  identicalWarnings[0][0],
  '[dashboard-weather] duplicate forecast source row deduped',
  'Duplicate warning should use a searchable dashboard weather prefix.',
);

const idBackedRows = normalizeWeatherForecastRows(
  [
    {
      id: 'nws-period-42',
      time: '2026-05-03T06:00:00Z',
      condition: 'Clear',
    },
  ],
  scope,
  formatter,
);

assert.ok(idBackedRows[0].key.endsWith('|nws-period-42'), 'Forecast row keys should prefer a real stable id when present.');

assert.deepStrictEqual(
  normalizeWeatherForecastRows([], scope, formatter),
  [],
  'Empty forecast data should normalize to no render rows.',
);
assert.deepStrictEqual(
  normalizeWeatherForecastRows([null, undefined], scope, formatter),
  [],
  'Null forecast data should normalize to no render rows.',
);

const staleCachedRows = normalizeWeatherForecastRows(
  [
    {
      time: '2026-05-03T06:00:00Z',
      sourceShape: 'daily.forecast',
      sourceState: 'stale',
      source: 'cache',
      condition: 'Clouds',
      highTemperatureF: 63,
      lowTemperatureF: 45,
    },
    {
      time: '2026-05-04T06:00:00Z',
      sourceShape: 'daily.forecast',
      sourceState: 'stale',
      source: 'cache',
      condition: 'Rain',
      highTemperatureF: 58,
      lowTemperatureF: 44,
    },
  ],
  {
    ...scope,
    sourceType: 'cached',
    provider: 'cache',
  },
  formatter,
);

assert.strictEqual(staleCachedRows.length, 2, 'Stale cached weather rows should still render when distinct.');
assert.ok(
  staleCachedRows.every((row) => row.stableId.includes('cache')),
  'Stale cached weather row ids should preserve cache/source context.',
);

const firstRender = renderForecastRowKeys([
  {
    time: '2026-05-03T06:00:00Z',
    period: 'morning',
    locationId: 'trailhead-west',
    source: 'openweather',
    condition: 'Clear',
    highTemperatureF: 76,
    lowTemperatureF: 50,
  },
  {
    time: '2026-05-03T18:00:00Z',
    period: 'evening',
    locationId: 'trailhead-west',
    source: 'openweather',
    condition: 'Wind',
    highTemperatureF: 72,
    lowTemperatureF: 48,
  },
]);
const refreshRender = renderForecastRowKeys([
  {
    time: '2026-05-03T06:00:00Z',
    period: 'morning',
    locationId: 'trailhead-west',
    source: 'openweather',
    condition: 'Clear',
    highTemperatureF: 78,
    lowTemperatureF: 51,
  },
  {
    time: '2026-05-03T18:00:00Z',
    period: 'evening',
    locationId: 'trailhead-west',
    source: 'openweather',
    condition: 'Wind',
    highTemperatureF: 70,
    lowTemperatureF: 47,
  },
]);

assert.deepStrictEqual(
  refreshRender.map((row) => row.stableId),
  firstRender.map((row) => row.stableId),
  'Forecast row identity should remain stable after weather data refresh when period/location/source are unchanged.',
);
assert.notDeepStrictEqual(
  refreshRender.map((row) => row.value),
  firstRender.map((row) => row.value),
  'Forecast row display values should still update across refreshes.',
);

const orientationRender = renderForecastRowKeys([
  {
    time: '2026-05-03T06:00:00Z',
    period: 'morning',
    locationId: 'trailhead-west',
    source: 'openweather',
    condition: 'Clear',
    highTemperatureF: 78,
    lowTemperatureF: 51,
  },
  {
    time: '2026-05-03T18:00:00Z',
    period: 'evening',
    locationId: 'trailhead-west',
    source: 'openweather',
    condition: 'Wind',
    highTemperatureF: 70,
    lowTemperatureF: 47,
  },
]);

assert.deepStrictEqual(
  orientationRender.map((row) => row.key),
  refreshRender.map((row) => row.key),
  'Orientation/layout rerenders should not change forecast React keys for unchanged weather rows.',
);
assert.strictEqual(
  new Set(orientationRender.map((row) => row.key)).size,
  orientationRender.length,
  'Simulated weatherForecastRows.map render should not produce duplicate React keys.',
);

console.log('Dashboard weather forecast row key checks passed.');

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

const { normalizeDailyForecastRows } = require(path.join(root, 'lib', 'weatherForecastTimeline.ts'));

function forecastRow(date, overrides = {}) {
  return {
    date,
    temp_day: null,
    temp_min: null,
    temp_max: null,
    humidity: null,
    pressure: null,
    wind_max: null,
    wind_gust_max: null,
    wind_deg: null,
    pop: 0,
    rain_total: 0,
    snow_total: 0,
    weather_id: null,
    weather_main: '',
    weather_description: '',
    weather_icon: '',
    ...overrides,
  };
}

const normalized = normalizeDailyForecastRows([
  forecastRow('2026-05-02T12:00:00Z', {
    temp_min: 48,
    temp_max: 70,
    wind_max: 12,
    wind_gust_max: 20,
    pop: 30,
    rain_total: 0.1,
    snow_total: 0,
    weather_id: 800,
    weather_main: 'Clear',
    weather_description: 'clear sky',
    weather_icon: '01d',
  }),
  forecastRow('2026-05-01T06:00:00Z', {
    temp_min: 51,
    temp_max: 64,
    wind_max: 8,
    wind_gust_max: 14,
    pop: 10,
    rain_total: 0.2,
    snow_total: 0,
    weather_id: 500,
    weather_main: 'Rain',
    weather_description: 'light rain',
    weather_icon: '10d',
  }),
  forecastRow('2026-05-01T18:00:00Z', {
    temp_min: 43,
    temp_max: 72,
    wind_max: 18,
    wind_gust_max: 28,
    pop: 80,
    rain_total: 0.4,
    snow_total: 0.1,
    weather_id: 801,
    weather_main: 'Clouds',
    weather_description: 'few clouds',
    weather_icon: '02d',
  }),
]);

assert.deepStrictEqual(
  normalized.map((day) => day.date),
  ['2026-05-01', '2026-05-02'],
  'Forecast rows should be deduped and sorted by normalized calendar date.',
);

const merged = normalized[0];
assert.strictEqual(merged.temp_min, 43, 'Merged temp_min should be the minimum known value.');
assert.strictEqual(merged.temp_max, 72, 'Merged temp_max should be the maximum known value.');
assert.strictEqual(merged.wind_max, 18, 'Merged wind_max should be the maximum known value.');
assert.strictEqual(merged.wind_gust_max, 28, 'Merged wind_gust_max should be the maximum known value.');
assert.strictEqual(merged.pop, 80, 'Merged pop should be the maximum known value.');
assert.ok(Math.abs(merged.rain_total - 0.6) < 0.000001, 'Merged rain_total should sum duplicate-day totals.');
assert.strictEqual(merged.snow_total, 0.1, 'Merged snow_total should sum duplicate-day totals.');
assert.strictEqual(merged.weather_id, 500, 'Merged weather_id should preserve the first valid row.');
assert.strictEqual(merged.weather_main, 'Rain', 'Merged weather_main should preserve the first valid row.');

const eightDays = Array.from({ length: 8 }, (_, index) =>
  forecastRow(`2026-05-${String(index + 1).padStart(2, '0')}`, {
    temp_min: 40 + index,
    temp_max: 60 + index,
  }),
);
assert.strictEqual(normalizeDailyForecastRows(eightDays).length, 7, 'Forecast timeline should render at most seven days.');

console.log('Weather forecast timeline dedupe checks passed.');

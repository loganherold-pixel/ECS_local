const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const React = require('react');

const root = path.join(__dirname, '..');
const widgetRenderersSource = fs
  .readFileSync(path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

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

function assertIncludes(fragment, message) {
  assert.ok(widgetRenderersSource.includes(fragment), message);
}

function assertNotIncludes(fragment, message) {
  assert.ok(!widgetRenderersSource.includes(fragment), message);
}

assertIncludes(
  "case 'attitude-command': return <AttitudeCommandWidget data={data} options={options} />;",
  'renderWidgetContent should route attitude-command through AttitudeCommandWidget.',
);
assertIncludes(
  'const weatherForecastRows = getAttitudeWeatherForecastRows(snapshot);',
  'AttitudeCommandWidget should build weatherForecastRows before rendering the weather panel.',
);
assertIncludes(
  'weatherForecastRows.map((row) =>',
  'AttitudeCommandWidget should render forecast rows through weatherForecastRows.map.',
);
assertIncludes(
  'key={row.key}',
  'weatherForecastRows.map should use the stable normalized row key.',
);
assertNotIncludes(
  'key={row.label}',
  'weatherForecastRows.map must not use duplicate-prone display labels as React keys.',
);

const scope = {
  widgetType: 'attitude-command-weather',
  sourceType: 'route_origin',
  provider: 'openweather',
  locationName: 'Mojave Road',
};

const formatter = {
  label: (day, index) => `Forecast ${day.time.slice(5, 10).replace('-', '/') || index + 1}`,
  value: (day) => `${day.condition || 'Forecast'} | ${day.highTemperatureF ?? '--'}/${day.lowTemperatureF ?? '--'}`,
};

function normalize(days, scopeOverride = scope) {
  return normalizeWeatherForecastRows(days, scopeOverride, formatter);
}

function renderWeatherForecastRows(days, scopeOverride = scope) {
  const originalError = console.error;
  const originalWarn = console.warn;
  const errors = [];
  const warnings = [];
  console.error = (...args) => errors.push(args);
  console.warn = (...args) => warnings.push(args);
  try {
    const rows = normalize(days, scopeOverride);
    const elements = rows.map((row) =>
      React.createElement('AttitudeCommandDetailRow', {
        key: row.key,
        label: row.label,
        value: row.value,
        stableId: row.stableId,
      }),
    );
    return { rows, elements, errors, warnings };
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
}

function reactElementKeys(elements) {
  return elements.map((element) => String(element.key));
}

function assertNoDuplicateKeys(rendered, message) {
  const keys = reactElementKeys(rendered.elements);
  assert.strictEqual(new Set(keys).size, keys.length, message);
  assert.ok(
    !rendered.errors.some((args) => String(args[0] ?? '').includes('Encountered two children with the same key')),
    'Dashboard weather render harness must not emit duplicate-key console errors.',
  );
}

const sameLabelDifferentRows = renderWeatherForecastRows([
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
    condition: 'Wind',
    highTemperatureF: 72,
    lowTemperatureF: 48,
  },
]);
assert.deepStrictEqual(
  sameLabelDifferentRows.rows.map((row) => row.label),
  ['Forecast 05/03', 'Forecast 05/03'],
  'Fixture should render duplicate Forecast 05/03 display labels.',
);
assert.strictEqual(sameLabelDifferentRows.elements.length, 2, 'Different forecast periods should both render.');
assertNoDuplicateKeys(sameLabelDifferentRows, 'Different rows with duplicate Forecast 05/03 labels should not collide.');

const trueDuplicates = renderWeatherForecastRows([
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
    sourceShape: 'normalized.forecast',
    sourceState: 'live',
    condition: 'Clear',
    highTemperatureF: 76,
    lowTemperatureF: 50,
  },
]);
assert.strictEqual(trueDuplicates.elements.length, 1, 'True duplicate forecast rows should be deduped before render.');
assertNoDuplicateKeys(trueDuplicates, 'True duplicates should not create duplicate React keys.');
assert.strictEqual(
  trueDuplicates.warnings.filter((args) => String(args[0]).includes('[dashboard-weather] duplicate forecast source row deduped')).length,
  1,
  'True duplicate source rows should emit one actionable debug warning, not a React duplicate-key warning.',
);

const differentLocations = renderWeatherForecastRows([
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
]);
assert.strictEqual(differentLocations.elements.length, 2, 'Different forecast locations should both render.');
assertNoDuplicateKeys(differentLocations, 'Different locations with duplicate labels should not collide.');

const cacheLiveMerged = renderWeatherForecastRows([
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
]);
assert.strictEqual(cacheLiveMerged.elements.length, 1, 'Exact cache + live merged rows should collapse before render.');
assertNoDuplicateKeys(cacheLiveMerged, 'Cache + live duplicates should not create duplicate React keys.');

const firstRefresh = renderWeatherForecastRows([
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
const updatedRefresh = renderWeatherForecastRows([
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
  firstRefresh.rows.map((row) => row.stableId),
  updatedRefresh.rows.map((row) => row.stableId),
  'Forecast row identity should remain stable after weather refresh.',
);
assert.notDeepStrictEqual(
  firstRefresh.rows.map((row) => row.value),
  updatedRefresh.rows.map((row) => row.value),
  'Forecast row display values should still update after refresh.',
);
assertNoDuplicateKeys(updatedRefresh, 'Updated forecast refresh render should keep unique keys.');

const portraitLayout = updatedRefresh;
const landscapeLayout = renderWeatherForecastRows([
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
  reactElementKeys(portraitLayout.elements),
  reactElementKeys(landscapeLayout.elements),
  'Orientation/layout rerender should not change weather forecast React keys.',
);
assertNoDuplicateKeys(landscapeLayout, 'Orientation/layout rerender should keep forecast React keys unique.');

console.log('Dashboard weather rendering regression checks passed.');

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const quickActionsSource = fs.readFileSync(path.join(root, 'components', 'QuickActionsSheet.tsx'), 'utf8');
const weatherPanelSource = fs.readFileSync(path.join(root, 'components', 'weather', 'WeatherIntelPanel.tsx'), 'utf8');
const currentCardSource = fs.readFileSync(path.join(root, 'components', 'weather', 'CurrentConditionsCard.tsx'), 'utf8');
const forecastSource = fs.readFileSync(path.join(root, 'components', 'weather', 'ForecastTimeline.tsx'), 'utf8');
const trailConditionsSource = fs.readFileSync(path.join(root, 'components', 'weather', 'TrailConditionsCard.tsx'), 'utf8');

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function notIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

[
  "import { useOperationalWeather } from '../lib/useOperationalWeather';",
  'const intelWeatherGps = useMemo(',
  'lat: gpsCoords?.lat ?? null,',
  'lng: gpsCoords?.lng ?? null,',
  'hasFix: gpsCoords != null,',
  'const fieldUtilitiesWeather = useOperationalWeather({',
  "enabled: visible && activeView === 'intel',",
  "units: 'imperial',",
  'weatherSnapshot={fieldUtilitiesWeather.snapshot}',
  'onRefreshWeather={fieldUtilitiesWeather.refresh}',
  'autoFetch={false}',
].forEach((fragment) => {
  includes(quickActionsSource, fragment, `Field Utilities weather parity should include ${fragment}`);
});

notIncludes(
  quickActionsSource,
  '<WeatherIntelPanel\n        latitude={gpsCoords?.lat ?? null}\n        longitude={gpsCoords?.lng ?? null}\n        locationLabel="Current Position"\n        compact={false}\n        autoFetch\n        frameless',
  'Field Utilities Intel should not let WeatherIntelPanel run its own auto-fetch path.',
);

[
  'const normalizedForecast = weatherSnapshot.normalized.forecast ?? [];',
  'const normalizedCurrent = weatherSnapshot.normalized.current ?? null;',
  'weatherSnapshot.raw ?? (',
  'firstNormalizedForecast?.lowTemperatureF',
  'firstNormalizedForecast?.highTemperatureF',
  'normalizeSunTimestampSeconds(firstNormalizedForecast?.sunrise)',
  'normalizeSunTimestampSeconds(firstNormalizedForecast?.sunset)',
  'todayForecast?.temp_min',
  'todayForecast?.temp_max',
  'normalizeSunTimestampSeconds(todayForecast?.sunrise)',
  'normalizeSunTimestampSeconds(todayForecast?.sunset)',
  'wind_gust: canonicalCurrent.windGust ?? normalizedCurrent?.windGustMph ?? null,',
  'forecast: hydratedForecast.slice(0, 16),',
  'temp_min: day.temp_min ?? normalized.lowTemperatureF ?? null,',
  'temp_max: day.temp_max ?? normalized.highTemperatureF ?? null,',
  'sunrise: normalizeSunTimestampSeconds(day.sunrise) ?? normalized.sunrise ?? null,',
  'sunset: normalizeSunTimestampSeconds(day.sunset) ?? normalized.sunset ?? null,',
  'wind_gust_max: day.wind_gust_max ?? normalized.windGustMph ?? null,',
  'trailAssessmentActive?: boolean;',
  'trailAssessmentActive = true',
  "(t.key === 'trail' && trailAssessmentActive && !selectedWeather?.trail_conditions)",
  'assessmentActive={trailAssessmentActive}',
].forEach((fragment) => {
  includes(weatherPanelSource, fragment, `WeatherIntelPanel should hydrate normalized weather parity field ${fragment}`);
});

[
  'function formatSunEventTime',
  'function normalizePressureHpa',
  'icon="reorder-three-outline"',
  'icon="pulse-outline"',
  'icon="water-outline"',
  'icon="eye-outline"',
  'const sunriseTime = formatSunEventTime(conditions.sunrise)',
  'const sunsetTime = formatSunEventTime(conditions.sunset)',
  'const pressureHpa = normalizePressureHpa(conditions.pressure)',
  '{pressureHpa != null && (',
  'formatTemperatureValue(conditions.temp_max)',
  'formatTemperatureValue(conditions.temp_min)',
  'conditions.wind_gust != null',
].forEach((fragment) => {
  includes(currentCardSource, fragment, `CurrentConditionsCard should render normalized current field ${fragment}`);
});

[
  '<Text style={styles.headerSub}>{dailyForecast.length}-DAY</Text>',
  'dailyForecast.map((day, idx) => {',
  'const gustMax = typeof day.wind_gust_max',
  'const dailyLow = finiteTemperature(day.temp_min)',
  'const dailyHigh = finiteTemperature(day.temp_max)',
  'formatForecastTemperature(dailyLow)',
  'formatForecastTemperature(dailyHigh)',
].forEach((fragment) => {
  includes(forecastSource, fragment, `ForecastTimeline should render available forecast field ${fragment}`);
});

[
  'assessmentActive?: boolean;',
  'assessmentActive = true',
  "inactive ? 'OFFLINE' : safeUpper(overall)",
  "inactive ? 'TRAIL ASSESSMENT OFFLINE' : getOverallLabel(overall)",
  'Start active guidance to evaluate route-specific trail conditions.',
].forEach((fragment) => {
  includes(trailConditionsSource, fragment, `TrailConditionsCard should support inactive guidance trail state ${fragment}`);
});

console.log('Field Utilities weather parity checks passed.');

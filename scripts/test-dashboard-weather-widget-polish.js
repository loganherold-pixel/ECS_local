const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const widgetRenderers = fs
  .readFileSync(path.join(root, 'components', 'dashboard', 'WidgetRenderers.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const widgetGrid = fs
  .readFileSync(path.join(root, 'components', 'dashboard', 'WidgetGrid.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

for (const fileName of [
  'atmosphere.png',
  'Clear.png',
  'Drizzle.png',
  'Rain.png',
  'Scattered_clouds.png',
  'Snow.png',
  'Thunderstorms.png',
]) {
  assert.ok(
    fs.existsSync(path.join(root, 'assets', 'weather', fileName)),
    `Weather background asset ${fileName} must be bundled under assets/weather.`,
  );
  assertIncludes(
    widgetRenderers,
    fileName,
    `Weather background asset ${fileName} must be statically required by the widget renderer.`,
  );
}

assertIncludes(
  widgetRenderers,
  "import WeatherIntelPanel from '../weather/WeatherIntelPanel';",
  'Dashboard weather detail should reuse the shared WeatherIntelPanel.',
);
assertIncludes(
  widgetRenderers,
  "type WeatherBackgroundType =",
  'Weather background selection should use a centralized typed visual state.',
);
assertIncludes(
  widgetRenderers,
  "'clear'",
  'Weather background selection should include the OpenWeather clear group.',
);
assertIncludes(
  widgetRenderers,
  "'clouds'",
  'Weather background selection should include the OpenWeather clouds group.',
);
assertIncludes(
  widgetRenderers,
  "'thunderstorm'",
  'Weather background selection should include the OpenWeather thunderstorm group.',
);
assertIncludes(
  widgetRenderers,
  "'atmosphere'",
  'Weather background selection should include the OpenWeather atmosphere group.',
);
assertIncludes(
  widgetRenderers,
  "weatherCode >= 700 && weatherCode < 800) return 'atmosphere'",
  'Weather background selection should route fog, haze, smoke, dust, sand, ash, squalls, and tornado-style 7xx codes to atmosphere.',
);
assertIncludes(
  widgetRenderers,
  'function getWeatherBackgroundType(condition: unknown): WeatherBackgroundType',
  'Weather background selection should be centralized and testable.',
);
assertIncludes(
  widgetRenderers,
  'readWeatherConditionCode',
  'Weather background selection should prefer provider weather codes when available.',
);
assertIncludes(
  widgetRenderers,
  'readWeatherCloudCover',
  'Weather background selection should account for cloud cover when available.',
);
assertIncludes(
  widgetRenderers,
  "weatherCode >= 200 && weatherCode < 300) return 'thunderstorm'",
  'Weather background selection should route OpenWeather 2xx codes to thunderstorms.',
);
assertIncludes(
  widgetRenderers,
  "weatherCode >= 300 && weatherCode < 400) return 'drizzle'",
  'Weather background selection should route OpenWeather 3xx codes to drizzle.',
);
assertIncludes(
  widgetRenderers,
  "weatherCode >= 500 && weatherCode < 600) return 'rain'",
  'Weather background selection should route OpenWeather 5xx codes to rain.',
);
assertIncludes(
  widgetRenderers,
  "weatherCode >= 600 && weatherCode < 700) return 'snow'",
  'Weather background selection should route OpenWeather 6xx codes to snow.',
);
assertIncludes(
  widgetRenderers,
  'resolveCommandWeatherBackgroundType(snapshot, weatherAvailable)',
  'Attitude Command weather panel should use the normalized dynamic background type.',
);
assertIncludes(
  widgetRenderers,
  '<AttitudeCommandWeatherBackgroundVisual weather={weather} />',
  'Weather panel should render the dynamic background visual without changing content layout.',
);
assertIncludes(
  widgetRenderers,
  'WEATHER_BACKGROUND_FADE_MS',
  'Weather background changes should fade instead of snapping.',
);
assertIncludes(
  widgetRenderers,
  'weatherBackgroundScrim',
  'Weather background should keep a dark readability scrim behind foreground UI.',
);
assertIncludes(
  widgetRenderers,
  'function getDashboardWeatherLocationLabel',
  'Weather widget should centralize location label formatting.',
);
assertIncludes(
  widgetRenderers,
  'function getDashboardWeatherSecondaryField',
  'Weather widget should centralize compact secondary field selection.',
);
assertIncludes(
  widgetRenderers,
  'const forecastStrip = getDashboardWeatherForecastStrip(snapshot);',
  '2x1 weather widget should render a small deterministic forecast strip when data exists.',
);
assertIncludes(
  widgetRenderers,
  '<WeatherIntelPanel',
  'Weather detail popup should include current, forecast, alerts, provider, and cache surfaces.',
);
assertIncludes(
  widgetRenderers,
  '<WidgetDetailSectionTitle>HOURLY</WidgetDetailSectionTitle>',
  'Weather detail popup should include an hourly section.',
);
assertIncludes(
  widgetRenderers,
  '<WidgetDetailSectionTitle>DATA SOURCE</WidgetDetailSectionTitle>',
  'Weather detail popup should expose provider/cache status.',
);
assertIncludes(
  widgetRenderers,
  'formatDashboardWeatherLocationConfidence(snapshot)',
  'Weather detail popup should expose location confidence.',
);
assertIncludes(
  widgetRenderers,
  "'Enable location for live forecast.'",
  'Permission-required copy should match live weather UX.',
);
assertIncludes(
  widgetRenderers,
  "'Using cached forecast.'",
  'Provider-error-with-cache copy should be honest and concise.',
);
assertIncludes(
  widgetRenderers,
  "'Forecast unavailable.'",
  'Provider-error-without-cache copy should be honest and concise.',
);
assertIncludes(
  widgetRenderers,
  "'Set location to enable forecast.'",
  'Location-unresolved copy should be honest and concise.',
);
assertNotIncludes(
  widgetRenderers,
  '`${headline} ${tempCompact}`',
  'Compact weather summary must not duplicate the temperature already shown elsewhere.',
);
assertNotIncludes(
  widgetRenderers,
  "label: 'TEMP'",
  '2x1 weather secondary rows should not duplicate the hero temperature.',
);
assertIncludes(
  widgetRenderers,
  'style={hwyWeatherCardS.compactLocationText}',
  '1x1 weather widget should show a location label.',
);
assertIncludes(
  widgetRenderers,
  'hwyWeatherCardS.tempHeroValue',
  '2x1 weather widget should use a single current-temperature hero.',
);
assertIncludes(
  widgetGrid,
  "slot.widgetType === 'hwy-forward-weather'",
  'Weather widget tap should open the detail popup without changing other widget tap behavior.',
);
assertIncludes(
  widgetGrid,
  'onWidgetLongPress(slot);',
  'Weather widget tap should use the existing detail popup path.',
);

console.log('Dashboard weather widget polish checks passed.');

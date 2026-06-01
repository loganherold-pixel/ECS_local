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
  'Weather_Clear_Sun.png',
  'Weather_Overcast_Cloud.png',
  'Weather_Rain.png',
  'Weather_Snow.png',
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
  "'clearNight'",
  'Weather background selection should distinguish clear night from clear day.',
);
assertIncludes(
  widgetRenderers,
  'Remaining_Sunlight_Night.png',
  'Weather background selection should reuse a bundled nighttime asset for night conditions.',
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

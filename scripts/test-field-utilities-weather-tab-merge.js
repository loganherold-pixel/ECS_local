const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const quickActionsSource = read('components/QuickActionsSheet.tsx');
const weatherPanelSource = read('components/weather/WeatherIntelPanel.tsx');

assert.ok(
  quickActionsSource.includes('resolveRouteTrailheadCoordinate(activeRoute)') &&
    quickActionsSource.includes('mergeForecastIntoConditions') &&
    quickActionsSource.includes('trailCoordinate={trailheadWeatherCoordinate}') &&
    quickActionsSource.includes('trailAssessmentActive={trailheadWeatherCoordinate != null}'),
  'Field Utilities Weather should pass active-route trailhead context into the merged weather panel.',
);

assert.ok(
  weatherPanelSource.includes('mergeForecastIntoConditions?: boolean;') &&
    weatherPanelSource.includes('trailCoordinate?: WeatherCoordinate | null;') &&
    weatherPanelSource.includes("mergeForecastIntoConditions && tab === 'forecast'") &&
    weatherPanelSource.includes("mergeForecastIntoConditions\n                  ? []\n                  : [{ key: 'forecast' as WeatherTab"),
  'WeatherIntelPanel should remove the standalone Forecast tab when the merged Field Utilities layout is enabled.',
);

assert.ok(
  weatherPanelSource.includes('forecast={currentTabWeather.forecast.slice(0, 6)}') &&
    weatherPanelSource.includes('forecast={trailTabWeather.forecast.slice(0, 6)}') &&
    weatherPanelSource.includes("'route_origin'") &&
    weatherPanelSource.includes('FETCHING TRAILHEAD WEATHER...'),
  'Merged Field Utilities weather should show six-day current and trail forecasts, with trail weather fetched from the route origin.',
);

console.log('Field Utilities weather tab merge checks passed.');

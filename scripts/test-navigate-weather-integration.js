const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const navigate = read('app/(tabs)/navigate.tsx');
const routeWeather = read('components/navigate/RouteCorridorWeather.tsx');
const toolsPopupStart = navigate.indexOf("renderMapPopup(\n    toolsPopupVisible");
const toolsPopupEnd = navigate.indexOf("renderMapPopup(\n    campScoutIntroVisible", toolsPopupStart);
assert(toolsPopupStart >= 0 && toolsPopupEnd > toolsPopupStart, 'Navigate should render Tools and Camp Scout popup sections.');
const toolsPopupSource = navigate.slice(toolsPopupStart, toolsPopupEnd);

assert(
  navigate.includes("import type { WeatherCoordinate } from '../../lib/weatherTypes'"),
  'Navigate weather coordinate handling should use the shared WeatherCoordinate type.',
);
assert(
  navigate.includes('const operationalWeather = useOperationalWeather({') &&
    navigate.includes('gps: {') &&
    navigate.includes('lat: gps.position?.latitude ?? null') &&
    navigate.includes('lng: gps.position?.longitude ?? null'),
  'Navigate current-location weather should use the shared operational weather hook with GPS coordinates.',
);
assert(
  routeWeather.includes('fetchSharedWeatherForCoordinates(') &&
    routeWeather.includes("'route_segment'"),
  'Route corridor weather must fetch through the shared weather service, not a direct provider parser.',
);
assert(
  navigate.includes('buildNavigateRouteWeatherCoordinates(displayedRoutePoints, navigateRouteWeatherRiskPoint)'),
  'Navigate should build route weather coordinates from the displayed route geometry.',
);
assert(
  navigate.includes("label: 'Route start'") &&
    navigate.includes("label: riskCoordinate ? 'Highest-risk route segment' : 'Route midpoint'") &&
    navigate.includes("label: 'Route destination'"),
  'Route weather should expose start, midpoint/risk, and destination forecast coordinates.',
);
assert(
  navigate.includes('const navigateSelectedWeatherCoordinate = useMemo<WeatherCoordinate | null>') &&
    navigate.includes('selectedCampIntel?.coordinate') &&
    navigate.includes('selectedCampScoutCandidate?.coordinate') &&
    navigate.includes('coord: selectedCampOpsIntel') &&
    navigate.includes('coord: selectedCommunityCampSite') &&
    navigate.includes('coord: editingPin') &&
    navigate.includes('coord: dropCoords'),
  'Selected camp, CampOps, campsite, and pin coordinates should be available to the weather tool.',
);
assert(
  toolsPopupSource.includes('CURRENT LOCATION FORECAST') &&
    toolsPopupSource.includes('toolsCurrentForecastSummary') &&
    toolsPopupSource.includes('<ECSBadge') &&
    toolsPopupSource.includes('onPress={operationalWeather.refresh}') &&
    navigate.includes('formatWeatherHeadline') &&
    navigate.includes('formatWeatherWindLine') &&
    navigate.includes('formatWeatherAlertLine'),
  'The Tools popup should expose a compact current-location forecast row backed by shared weather formatters and refresh path.',
);
assert(
  !toolsPopupSource.includes('<WeatherIntelPanel') &&
    !toolsPopupSource.includes('ROUTE WEATHER') &&
    !toolsPopupSource.includes('SELECTED POINT FORECAST') &&
    !toolsPopupSource.includes('navigateWeatherToolStack'),
  'The main Tools popup should not embed full current, route, or selected-point WeatherIntelPanel stacks.',
);
assert(
  !navigate.includes('Coordinate-first forecasts from the shared ECS weather service') &&
    !navigate.includes('shared ECS weather service'),
  'The Tools weather popup should not expose internal weather-service implementation copy.',
);
assert(
  navigate.includes('const toolsCurrentForecastSummary = useMemo') &&
    navigate.includes('operationalWeather.snapshot.status.kind') &&
    navigate.includes('operationalWeather.refresh'),
  'Current-location forecast should render the shared operational weather snapshot state and refresh path.',
);
assert(
  navigate.includes("const navigateTrailAssessmentActive = navigationOverlayMode === 'active'") &&
    navigate.includes('trailAssessmentActive={navigateTrailAssessmentActive}'),
  'Navigate weather Trail Conditions should only show active route assessment when guidance is active.',
);
assert(
  navigate.includes('const hideWeatherTopOverlays =') &&
    navigate.includes('!topStatusOverlaysVisible ||') &&
    navigate.includes('topRouteSurfaceVisible ||') &&
    navigate.includes('idleDestinationSearchVisible'),
  'Floating weather overlays should stay out of the active/preview guidance band.',
);
assert(
  !navigate.includes("import Toast from '../../components/Toast';") &&
    !navigate.includes('<Toast') &&
    !navigate.includes('mapToastTopOffset'),
  'Navigate weather should not revive the legacy centered Toast status banner.',
);
assert(
  !navigate.includes('const hideWeatherTopOverlays = true'),
  'Navigate must not hard-disable weather overlays with a stale constant.',
);

console.log('Navigate weather integration checks passed.');

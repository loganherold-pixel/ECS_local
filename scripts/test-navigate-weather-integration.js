const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const navigate = read('app/(tabs)/navigate.tsx');
const routeWeather = read('components/navigate/RouteCorridorWeather.tsx');

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
  navigate.includes('navigateWeatherToolHeader') &&
    navigate.includes('CURRENT LOCATION FORECAST') &&
    navigate.includes('ROUTE WEATHER') &&
    navigate.includes('SELECTED POINT FORECAST'),
  'The Tools popup should expose current, route, and selected-point weather panels.',
);
assert(
  !navigate.includes('Coordinate-first forecasts from the shared ECS weather service') &&
    !navigate.includes('shared ECS weather service'),
  'The Tools weather popup should not expose internal weather-service implementation copy.',
);
assert(
  navigate.includes('weatherSnapshot={operationalWeather.snapshot}') &&
    navigate.includes('onRefreshWeather={operationalWeather.refresh}'),
  'Current-location panel should render the shared operational weather snapshot and refresh path.',
);
assert(
  navigate.includes("const navigateTrailAssessmentActive = navigationOverlayMode === 'active'") &&
    navigate.includes('trailAssessmentActive={navigateTrailAssessmentActive}'),
  'Navigate weather Trail Conditions should only show active route assessment when guidance is active.',
);
assert(
  navigate.includes('coordinates={navigateRouteWeatherCoordinates}') &&
    navigate.includes('latitude={navigateSelectedWeatherCoordinate.lat}') &&
    navigate.includes('longitude={navigateSelectedWeatherCoordinate.lng}'),
  'Route and selected-point panels should fetch by their own coordinates.',
);
assert(
  navigate.includes('const hideWeatherTopOverlays = !topStatusOverlaysVisible || topRouteSurfaceVisible'),
  'Floating weather overlays should stay out of the active/preview guidance band.',
);
assert(
  navigate.includes("const mapToastAttachedToGuidance = navigationOverlayMode === 'active'") &&
    navigate.includes('topOffset={mapToastTopOffset}') &&
    navigate.includes('zIndex={mapToastAttachedToGuidance ? 84 : undefined}'),
  'Weather advisory toasts should share the active-guidance-safe toast offset.',
);
assert(
  !navigate.includes('const hideWeatherTopOverlays = true'),
  'Navigate must not hard-disable weather overlays with a stale constant.',
);

console.log('Navigate weather integration checks passed.');

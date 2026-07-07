const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
}

const screen = read('app/explore-trip-builder.tsx');

assert.ok(
  screen.includes('function routeLinePointsForTripMap(route: TripBuilderRouteInput): TripMapCoordinate[]'),
  'Trip Builder maps must use a dedicated route-line helper for renderable geometry.',
);
assert.ok(
  screen.includes('if (normalized.length >= 2) return normalized;') &&
    screen.includes('return [];'),
  'Route-line helper must not fabricate a straight start-to-end route when geometry is unavailable.',
);
assert.ok(
  screen.includes('routeLinePointsForTripMap(route)'),
  'Trip Builder map overlays must ask for route-line geometry instead of start/end route points.',
);
assert.ok(
  !screen.includes('const fallbackPoints = markers'),
  'Trip Builder map models must not turn camp, bailout, resupply, or itinerary markers into route-line fallback points.',
);
assert.ok(
  !screen.includes(': fallbackPoints'),
  'Trip Builder map models must not render marker-to-marker fallback lines.',
);
assert.ok(
  screen.includes('connectToRouteLine: false'),
  'Reference camp and bailout pins must remain explicitly unconnected from route guidance.',
);
assert.ok(
  screen.includes('markers={[...suggestedCampMarkers, ...campMarkers]}') &&
    screen.includes('markers={[...routeEndpointMarkers, ...operatorPinMarkers, ...selectedMarker]}'),
  'Camp and bailout picker pins must render as marker overlays, not route path points.',
);
assert.ok(
  screen.includes('TRIP_BUILDER_PICKER_ROUTE_PREVIEW_MAX_POINTS'),
  'Trip Builder picker maps should cap route-preview geometry before rendering the mobile preview.',
);
assert.ok(
  screen.includes('function simplifyTripBuilderPickerRoutePoints(points: TripMapCoordinate[]): TripMapCoordinate[]'),
  'Trip Builder picker maps should use a dedicated simplifier for camp/bailout route previews.',
);
assert.ok(
  screen.includes('routeCoords={pickerRouteCoords}'),
  'Camp and bailout picker maps should render simplified route preview coordinates instead of the full route payload.',
);
assert.ok(
  screen.includes('TRIP_BUILDER_PICKER_MAP_HEIGHT'),
  'Trip Builder camp/bailout picker maps should use a bounded mobile viewport instead of flexing to the full overlay height.',
);
assert.ok(
  screen.includes('height: TRIP_BUILDER_PICKER_MAP_HEIGHT'),
  'Trip Builder picker map frame should keep a bounded mobile viewport.',
);
assert.ok(
  (screen.match(/<MapFallbackSurface/g) ?? []).length >= 2,
  'Camp and bailout picker maps should use the lightweight reference surface instead of mounting WebView.',
);
assert.ok(
  !screen.includes('TripBuilderPickerMapStyleSwitch') &&
    !screen.includes('TRIP_BUILDER_PICKER_MAP_STYLES') &&
    !screen.includes('pickerMapStyle'),
  'Reference pickers should not expose stale Mapbox Day/Satellite controls when using the non-WebView surface.',
);

console.log('Trip Builder map route spine checks passed.');

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
  screen.includes('pinMarkers={[...suggestedCampMarkers, ...campMarkers]}') &&
    screen.includes('pinMarkers={[...routeEndpointMarkers, ...operatorPinMarkers, ...selectedMarker]}'),
  'Camp and bailout picker pins must render as marker overlays, not route path points.',
);

console.log('Trip Builder map route spine checks passed.');

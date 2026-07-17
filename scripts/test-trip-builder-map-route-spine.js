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
  screen.includes('const spine = buildTripBuilderCanonicalRouteSpine({') &&
    screen.includes('return spine.lineString') &&
    screen.includes('spine.coordinates.filter(isValidMapCoordinate)'),
  'Route-line helper must consume the behavioral canonical-spine result instead of flattening route fields.',
);
assert.ok(
  screen.includes('routeLinePointsForTripMap(route)'),
  'Trip Builder map overlays must ask for route-line geometry instead of start/end route points.',
);
assert.ok(
  screen.includes('buildTripBuilderCanonicalRouteSpine({') &&
    screen.includes('const selectedPrimaryRouteSpine = useMemo(() => {'),
  'Mounted Trip Builder maps should compose one shared origin/approach/trailhead/trail primary spine.',
);
assert.ok(
  screen.includes("selectedPrimaryRouteSpine?.status === 'invalid'") &&
    screen.includes('routeLinePointsForTripMap(selectedRoute as unknown as TripBuilderRouteInput)'),
  'A rejected full spine may fall back only to the separately validated canonical trail, not older raw preview geometry.',
);
assert.ok(
  (screen.match(/routePreviewPoints=\{selectedPreparedRoutePoints\}/g) ?? []).length >= 3,
  'Generated Trip Map, Camp Plan, and Bailout Plan should consume the same prepared primary spine.',
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
assert.ok(
  screen.includes('TRIP_BUILDER_PICKER_ROUTE_PREVIEW_MAX_POINTS'),
  'Trip Builder picker maps should cap route-preview geometry before rendering the mobile preview.',
);
assert.ok(
  screen.includes('function simplifyTripBuilderPickerRoutePoints(') &&
    screen.includes('trailhead: TripMapCoordinate | null') &&
    screen.includes('preserveCoordinates: trailhead ? [trailhead] : []'),
  'Trip Builder picker maps should use a dedicated simplifier for camp/bailout route previews.',
);
assert.ok(
  (screen.match(/simplifyTripBuilderPickerRoutePoints\(routePoints, pickerTrailhead\)/g) ?? []).length === 2,
  'Camp Plan and Bailout Plan must both preserve the selected trailhead while simplifying their shared spine.',
);
assert.ok(
  screen.includes('routeCoords={pickerRouteCoords}'),
  'Camp and bailout picker degraded surfaces should retain simplified route coordinates instead of the full route payload.',
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
  (screen.match(/<MapRenderer/g) ?? []).length >= 3 &&
    (screen.match(/routeRenderMode="selected"/g) ?? []).length >= 3 &&
    (screen.match(/routeLineKey=\{routeLineKey\}/g) ?? []).length >= 3 &&
    screen.includes("buildTripRoutePreviewCameraCommand(pickerRoutePoints, 'camp_picker')") &&
    screen.includes("buildTripRoutePreviewCameraCommand(pickerRoutePoints, 'bailout_picker')"),
  'Camp and bailout pickers should mount interactive maps with route-fit camera framing.',
);
assert.ok(
  (screen.match(/<MapFallbackSurface/g) ?? []).length >= 2 &&
    (screen.match(/statusLabel="Offline reference"/g) ?? []).length >= 2,
  'Camp and bailout pickers should retain the lightweight route line only as a truthful offline/token fallback.',
);
assert.ok(
  !screen.includes('TripBuilderPickerMapStyleSwitch') &&
    !screen.includes('TRIP_BUILDER_PICKER_MAP_STYLES') &&
    !screen.includes('pickerMapStyle'),
  'Reference pickers should not expose stale Mapbox Day/Satellite controls when using the non-WebView surface.',
);

console.log('Trip Builder map route spine checks passed.');

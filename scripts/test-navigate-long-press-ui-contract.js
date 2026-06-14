const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigate = fs.readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8').replace(/\r\n/g, '\n');
const mapRenderer = fs
  .readFileSync(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function includes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function excludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

includes(navigate, "from '../../lib/navigateLongPressActions'", 'Navigate should use the long-press action resolver.');
includes(navigate, "from '../../lib/navigatePointRouteBuilder'", 'Navigate should use the pin-to-pin route builder domain helper.');
includes(navigate, "from '../../lib/navigateRouteProfileScrubber'", 'Navigate should use the route profile scrubber helper.');
includes(navigate, 'longPressContext', 'Navigate should track long-press menu context.');
includes(navigate, 'routeBuilderDraft', 'Navigate should track the anchor/leg route draft.');
includes(navigate, 'handleLongPressDrawRoute', 'Long-press menu should start Draw Route.');
includes(navigate, 'handleLongPressAddWaypoint', 'Long-press menu should add waypoints.');
includes(navigate, 'handleLongPressInfo', 'Long-press menu should open point info.');
includes(navigate, 'handleLongPressNavigateHere', 'Long-press menu should expose Navigate Here.');
includes(navigate, 'routeBuilderMode="anchor_trace"', 'Navigate should put MapRenderer in anchor-trace mode.');
includes(navigate, 'routeBuilderAnchors={routeBuilderDraft.anchors}', 'Navigate should render route builder anchors on the map.');
includes(navigate, 'routeProfileFocusCoordinate={routeProfileFocus?.coordinate ?? null}', 'Navigate should focus the map from the route profile scrubber.');
includes(navigate, 'START NEEDS GPS', 'Start should be disabled with clear copy when GPS is unavailable.');
includes(navigate, 'SAVE ROUTE', 'Builder save should open an explicit save route flow.');
includes(navigate, 'NOTE', 'Builder save should include a note field.');
includes(navigate, 'DRAW ROUTE', 'Long-press menu should include Draw Route.');
includes(navigate, 'ADD WAYPOINT', 'Long-press menu should include Add Waypoint.');
includes(navigate, 'NAVIGATE HERE', 'Long-press menu should include Navigate Here.');
excludes(navigate, 'TRACE A TRAIL TO BUILD ROUTE', 'Old trace-mode toast should be removed.');
excludes(navigate, 'BUILD ROUTE CANCELLED', 'Old cancellation warning toast should be removed.');

includes(mapRenderer, "routeBuilderMode?: 'freehand' | 'anchor_trace'", 'MapRenderer should expose an explicit route builder mode.');
includes(mapRenderer, 'routeBuilderAnchors?: RouteBuilderAnchorMarker[]', 'MapRenderer should accept anchor markers.');
includes(mapRenderer, 'routeProfileFocusCoordinate?: LatLng | null', 'MapRenderer should accept route profile focus coordinates.');
includes(mapRenderer, 'routeableFeature: buildRouteableFeaturePayloadAtPoint(e.point, e.lngLat)', 'Long-press payload should include routeable feature context.');
includes(mapRenderer, "if (routeBuilderMode === 'anchor_trace') return false;", 'Anchor-trace mode should disable freehand pointer drawing.');
includes(mapRenderer, "if (routeBuilderMode === 'anchor_trace')", 'Anchor-trace mode should alter click handling.');
includes(mapRenderer, 'route-profile-focus-source', 'MapRenderer should render the profile focus point.');

console.log('Navigate long-press UI contract checks passed.');

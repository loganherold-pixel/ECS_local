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
includes(navigate, "from '../../lib/shellLayout'", 'Navigate should use shared shell layout helpers for dock-safe overlays.');
includes(navigate, 'getCommandDockTotalClearance(insets.bottom, commandDockTabletScale)', 'Navigate overlays should reserve Android tablet command dock lift clearance.');
includes(navigate, 'longPressContext', 'Navigate should track long-press menu context.');
includes(navigate, 'routeBuilderDraft', 'Navigate should track the anchor/leg route draft.');
includes(navigate, 'handleLongPressDrawRoute', 'Long-press menu should start Draw Route.');
includes(
  navigate,
  'handleRouteBuilderAnchorTap(longPressContext.coordinate);\n  setLongPressContext(null);\n  setLongPressInfoExpanded(false);',
  'Draw Route should dismiss the long-press menu after setting the route anchor.',
);
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
includes(navigate, 'bottom: routeSurfaceBottomOffset + OVERLAY_GAP', 'Long-press menu should clear the command dock using the shared route surface offset.');
excludes(navigate, 'TRACE A TRAIL TO BUILD ROUTE', 'Old trace-mode toast should be removed.');
excludes(navigate, 'BUILD ROUTE CANCELLED', 'Old cancellation warning toast should be removed.');

includes(mapRenderer, "routeBuilderMode?: 'freehand' | 'anchor_trace'", 'MapRenderer should expose an explicit route builder mode.');
includes(mapRenderer, 'routeBuilderAnchors?: RouteBuilderAnchorMarker[]', 'MapRenderer should accept anchor markers.');
includes(mapRenderer, 'routeProfileFocusCoordinate?: LatLng | null', 'MapRenderer should accept route profile focus coordinates.');
includes(mapRenderer, 'routeableFeature: buildRouteableFeaturePayloadAtPoint(e.point, e.lngLat)', 'Long-press payload should include routeable feature context.');
includes(mapRenderer, 'buildRenderedRouteableLongPressPayloadAtPoint', 'Long-press should resolve visible rendered roads/trails when ECS overlay geometry is not present.');
includes(mapRenderer, "kind: 'rendered_routeable_feature'", 'Rendered road/trail long-press payload should be marked routeable for Navigate Here.');
includes(mapRenderer, 'isRouteBuilderRouteableFeature(feature)', 'Rendered road/trail long-press fallback should reuse route-builder routeability rules.');
includes(mapRenderer, 'map.queryRenderedFeatures([', 'Rendered road/trail long-press fallback should inspect nearby rendered map features.');
includes(mapRenderer, 'installTouchLongPressMenuHandler', 'MapRenderer should install a touch long-press handler for mobile/WebView maps.');
includes(mapRenderer, 'installPointerLongPressMenuHandler', 'MapRenderer should install a pointer long-press fallback for Android WebView maps.');
includes(mapRenderer, 'getLongPressEventTargets', 'Long-press handlers should listen on the Mapbox canvas, container, and document path.');
includes(mapRenderer, 'addLongPressEventListener', 'Long-press handlers should centralize capture-phase event registration.');
includes(mapRenderer, 'capture: true', 'Android WebView long-press listeners should run in capture phase before Mapbox stops propagation.');
includes(mapRenderer, 'LONG_PRESS_TOUCH_DELAY_MS', 'Touch long-press should use an explicit delay before opening the action menu.');
includes(mapRenderer, "addLongPressEventListener(targets[i], 'pointerdown'", 'Pointer long-press should begin from map pointerdown when touch events are not delivered.');
includes(mapRenderer, "addLongPressEventListener(targets[i], 'pointermove'", 'Pointer long-press should cancel when the pointer pans the map.');
includes(mapRenderer, "addLongPressEventListener(targets[i], 'pointerup'", 'Pointer long-press should clear after pointerup.');
includes(mapRenderer, "addLongPressEventListener(targets[i], 'pointercancel'", 'Pointer long-press should clear after pointercancel.');
includes(mapRenderer, "addLongPressEventListener(targets[i], 'touchstart'", 'Touch long-press should begin from map touchstart.');
includes(mapRenderer, "addLongPressEventListener(targets[i], 'touchmove'", 'Touch long-press should cancel when the user pans the map.');
includes(mapRenderer, "addLongPressEventListener(targets[i], 'touchend'", 'Touch long-press should clear after touchend.');
includes(mapRenderer, "addLongPressEventListener(targets[i], 'touchcancel'", 'Touch long-press should clear after touchcancel.');
includes(mapRenderer, 'map.unproject(point)', 'Touch long-press should convert screen point to map coordinates.');
includes(mapRenderer, "send('longPress'", 'Touch long-press should dispatch the same longPress payload as contextmenu.');
includes(mapRenderer, 'longPressSuppressClickUntil', 'Touch long-press should suppress the follow-up click after opening the menu.');
includes(mapRenderer, "if (routeBuilderMode === 'anchor_trace') return false;", 'Anchor-trace mode should disable freehand pointer drawing.');
includes(mapRenderer, "if (routeBuilderMode === 'anchor_trace')", 'Anchor-trace mode should alter click handling.');
includes(mapRenderer, 'route-profile-focus-source', 'MapRenderer should render the profile focus point.');

console.log('Navigate long-press UI contract checks passed.');

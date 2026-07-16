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
includes(navigate, 'getCommandDockTotalClearance(insets.bottom, commandDockTabletScale)', 'Navigate overlays should reserve bottom-pinned CommandDock clearance.');
includes(navigate, 'longPressContext', 'Navigate should track long-press menu context.');
includes(navigate, 'routeBuilderDraft', 'Navigate should track the anchor/leg route draft.');
includes(navigate, 'handleLongPressDrawRoute', 'Long-press menu should start Draw Route.');
includes(
  navigate,
  'handleRouteBuilderAnchorTap(longPressContext.coordinate, longPressContext.routeableFeature);',
  'Draw Route should pass routeable feature geometry into the anchor route builder.',
);
includes(
  navigate,
  'activeGuidanceRouteExtensionAvailable',
  'Navigate should detect when an active guidance route can be extended from its endpoint.',
);
includes(
  navigate,
  'addActiveGuidanceExtensionAnchor(currentDraft, {',
  'Draw Route during active guidance should seed the builder from the active route end.',
);
includes(
  navigate,
  'const currentDraft = routeBuilderDraftRef.current;',
  'Rapid map taps should append to the latest synchronous anchor draft instead of a stale render closure.',
);
includes(
  navigate,
  'routeableFeatureToNavigateTraceableSegments(routeableFeature)',
  'Navigate should pass connected rendered road and trail features into pin-to-pin tracing.',
);
includes(
  navigate,
  "segment.buildSource?.kind === 'rendered_routeable_geometry'",
  'Verified pin-built road/trail legs should remain mounted instead of entering a driving rematch cycle.',
);
includes(
  navigate,
  "canBuildRoute: !activeNavigationRunning || activeGuidanceRouteExtensionAvailable",
  'Long-press Draw Route should remain available during active guidance only when ECS can extend from the active endpoint.',
);
includes(
  navigate,
  'routeBuilderActiveExtensionMode',
  'Navigate should track active-guidance route extension mode for UI and save metadata.',
);
includes(
  navigate,
  'routeBuilderColor={routeBuilderActiveExtensionMode ? ACTIVE_GUIDANCE_EXTENSION_COLOR : ROUTE_BUILDER_DEFAULT_COLOR}',
  'Active guidance extensions should render in the same blue family as active guidance while normal builder remains unchanged.',
);
includes(
  navigate,
  'const activeGuidanceExtensionStats = useMemo(() =>',
  'Navigate should derive active-guidance extension distance/verification stats from the drafted legs.',
);
includes(
  navigate,
  'const extensionRemainingDistanceM = activeGuidanceExtensionStats?.verified',
  'Verified active-guidance extensions should be included in remaining distance calculations.',
);
includes(
  navigate,
  'const extensionEtaIso = activeGuidanceExtensionStats?.verified',
  'Verified active-guidance extensions should adjust the active guidance ETA estimate.',
);
includes(
  navigate,
  'Active guidance extension verified',
  'Active guidance copy should clearly label extension ETA/mileage as an operator-added extension estimate.',
);
includes(navigate, 'handleLongPressAddWaypoint', 'Long-press menu should add waypoints.');
includes(navigate, 'handleLongPressInfo', 'Long-press menu should open point info.');
includes(navigate, 'handleLongPressNavigateHere', 'Long-press menu should expose Navigate Here.');
includes(navigate, 'routeBuilderMode="anchor_trace"', 'Navigate should put MapRenderer in anchor-trace mode.');
includes(navigate, 'routeBuilderAnchors={routeBuilderDraft.anchors}', 'Navigate should render route builder anchors on the map.');
includes(navigate, 'routeProfileFocus={routeProfileFocusPayload}', 'Navigate should focus the map from the route profile scrubber.');
includes(navigate, 'START NEEDS GPS', 'Start should be disabled with clear copy when GPS is unavailable.');
includes(navigate, 'SAVE ROUTE', 'Builder save should open an explicit save route flow.');
includes(navigate, 'NOTE', 'Builder save should include a note field.');
includes(navigate, 'DRAW ROUTE', 'Long-press menu should include Draw Route.');
includes(navigate, 'ADD WAYPOINT', 'Long-press menu should include Add Waypoint.');
includes(navigate, 'NAVIGATE HERE', 'Long-press menu should include Navigate Here.');
includes(navigate, 'const mapPointBannerTopOffset = TOP_STATUS_STACK_START;', 'Navigate should anchor the long-press map point banner at the top of the Mapbox body.');
includes(navigate, 'top: mapPointBannerTopOffset', 'Long-press map point banner should render from the top map body anchor.');
excludes(navigate, 'bottom: routeSurfaceBottomOffset + OVERLAY_GAP', 'Long-press map point banner must not anchor near the lower dock/route surface.');
excludes(navigate, 'TRACE A TRAIL TO BUILD ROUTE', 'Old trace-mode toast should be removed.');
excludes(navigate, 'BUILD ROUTE CANCELLED', 'Old cancellation warning toast should be removed.');
excludes(navigate, "showToast('NO LOADED TRAIL GEOMETRY BETWEEN POINTS')", 'Route-builder geometry misses should not show a top warning banner.');

includes(mapRenderer, "routeBuilderMode?: 'freehand' | 'anchor_trace'", 'MapRenderer should expose an explicit route builder mode.');
includes(mapRenderer, 'routeBuilderAnchors?: RouteBuilderAnchorMarker[]', 'MapRenderer should accept anchor markers.');
includes(mapRenderer, 'routeProfileFocus?: RouteProfileFocusPayload | null', 'MapRenderer should accept route profile focus metadata.');
includes(mapRenderer, 'var routeableFeature = buildRouteableFeaturePayloadAtPoint(e.point, e.lngLat);', 'Route-builder taps should resolve routeable feature context before dispatch.');
includes(mapRenderer, 'routeableFeature: routeableFeature', 'Route-builder tap payloads should include the resolved routeable feature context.');
includes(mapRenderer, 'routeBuilderLastAnchorTapCoordinate', 'Rapid taps should retain the latest anchor inside the map runtime while React state catches up.');
includes(mapRenderer, 'coordinates: routeablePayloadLineForFeatureAtPoint', 'Long-press and route-builder taps should include compact routeable feature geometry.');
includes(mapRenderer, 'buildRenderedRouteableLongPressPayloadAtPoint', 'Long-press should resolve visible rendered roads/trails when ECS overlay geometry is not present.');
includes(mapRenderer, 'buildRenderedRouteableTraceNetworkAtPoint', 'Route-builder taps should capture the connected visible road/trail network between anchors.');
includes(mapRenderer, 'payload.connectedSegments = connectedSegments', 'Route-builder tap payloads should carry connected geometry into the pure route model.');
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
includes(mapRenderer, "if (!routeBuilderActive || routeBuilderMode === 'anchor_trace') return;", 'Anchor-trace mode should not emit stale freehand segment updates over pin-built legs.');
includes(mapRenderer, "if (routeBuilderMode === 'anchor_trace')", 'Anchor-trace mode should alter click handling.');
includes(mapRenderer, 'route-profile-focus-source', 'MapRenderer should render the profile focus point.');
includes(mapRenderer, "provisional: isRouteBuilderSegmentProvisional(segment)", 'MapRenderer should flag unverified route-builder extension segments as provisional.');
includes(mapRenderer, "['case', ['get', 'provisional'], ['literal', [1.2, 1.1]], ['literal', [1, 0]]]", 'Route-builder provisional segments should render dashed with a valid Mapbox expression until ECS/Mapbox verification is solid.');
includes(mapRenderer, 'anchor.hidden', 'MapRenderer should skip hidden active-route-end seed anchors.');

console.log('Navigate long-press UI contract checks passed.');

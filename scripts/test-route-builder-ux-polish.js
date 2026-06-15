const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigate = fs
  .readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const mapRenderer = fs
  .readFileSync(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  navigate,
  'const routeBuilderControlBottomOffset =\n    routeSurfaceBottomOffset + (routePreviewVisualMode ? routeSurfaceHeight + OVERLAY_GAP : 0);',
  'Build Route controls should use the same bottom/app-safe clearance as Road Preview and rise above preview when needed.',
);
assertIncludes(
  navigate,
  'bottom: routeBuilderControlBottomOffset,\n                left: OVERLAY_EDGE,',
  'Build Route control strip should anchor bottom-left instead of top-right.',
);
assertNotIncludes(
  navigate,
  'top: MAP_TOP_CONTROL_ROW,\n                right: OVERLAY_EDGE,\n                maxWidth: Math.min(322, adaptive.windowWidth - OVERLAY_EDGE * 2),',
  'Build Route control strip should not use the old top-right placement.',
);
assertIncludes(
  navigate,
  'const campsiteDrawControlsVisible =\n    !routeBuilderActive &&',
  'Campsite polygon draw controls should be hidden while Build Route is active.',
);
assertNotIncludes(
  navigate,
  'accessibilityLabel="Save campsite drawing"',
  'Finished campsite polygon controls should not expose the obsolete Save action.',
);

assertIncludes(navigate, "from '../../lib/navigateLongPressActions'", 'Navigate should use long-press action context.');
assertIncludes(navigate, "from '../../lib/navigatePointRouteBuilder'", 'Navigate should use anchor route-builder helpers.');
assertIncludes(navigate, 'routeBuilderMode="anchor_trace"', 'MapRenderer should run the new route builder in anchor-trace mode.');
assertIncludes(navigate, 'routeBuilderAnchors={routeBuilderDraft.anchors}', 'Build Route should render dropped A/B/C anchors.');
assertIncludes(navigate, 'handleLongPressDrawRoute', 'Long-press menu should start Draw Route.');
assertIncludes(navigate, 'handleLongPressAddWaypoint', 'Long-press menu should add a waypoint.');
assertIncludes(navigate, 'handleLongPressNavigateHere', 'Long-press menu should route to viable points.');
assertIncludes(navigate, 'DRAW ROUTE', 'Long-press menu should include Draw Route copy.');
assertIncludes(navigate, 'ADD WAYPOINT', 'Long-press menu should include Add Waypoint copy.');
assertIncludes(navigate, 'NAVIGATE HERE', 'Long-press menu should include Navigate Here copy.');
assertIncludes(navigate, 'START NEEDS GPS', 'Start should clearly explain disabled GPS state.');
assertIncludes(navigate, 'SAVE ROUTE', 'Build Route control strip and sheet should expose Save Route.');
assertIncludes(navigate, 'NOTE', 'Save Route sheet should include a note field.');

assertNotIncludes(navigate, 'TRACE A TRAIL TO BUILD ROUTE', 'Old trace toast should be removed.');
assertNotIncludes(navigate, 'BUILD ROUTE CANCELLED', 'Old cancellation warning toast should be removed.');
assertNotIncludes(navigate, 'Build Route On Map', 'Tools should not expose the obsolete freehand builder entry.');
assertNotIncludes(navigate, 'Draw a custom route directly on the Navigate map.', 'Old freehand builder help copy should be removed.');

assertIncludes(
  navigate,
  'Point A set. Tap the next point on the trail.',
  'Build Route control strip should guide users through anchor placement.',
);
assertIncludes(
  navigate,
  'Point not linked. Tap closer to loaded road or trail geometry.',
  'Build Route should explain blocked anchor legs in the compact control strip without saving raw geometry.',
);
assertNotIncludes(
  navigate,
  "showToast('NO LOADED TRAIL GEOMETRY BETWEEN POINTS')",
  'Build Route trace failures should not surface as top map warning banners.',
);
assertIncludes(
  navigate,
  'accessibilityLabel="Undo last Build Route point"',
  'Undo action should have an accessible point-based label.',
);
assertIncludes(
  navigate,
  'accessibilityLabel="Clear all Build Route points"',
  'Clear All action should have an accessible point-based label.',
);
assertIncludes(
  navigate,
  'accessibilityLabel="Cancel Build Route"',
  'Cancel action should have an accessible label.',
);
assertIncludes(
  navigate,
  'accessibilityLabel="Save Build Route"',
  'Save action should have an accessible label.',
);
assertIncludes(
  navigate,
  'accessibilityLabel="Start Build Route"',
  'Start action should have an accessible label.',
);
assertIncludes(
  navigate,
  '<Text style={styles.routeBuilderStatusActionText}>CLEAR ALL</Text>',
  'Build Route control strip should label full draft deletion as Clear All.',
);
assertIncludes(
  mapRenderer,
  "if (routeBuilderMode === 'anchor_trace') return false;",
  'MapRenderer should suppress old pointer/freehand drawing in anchor-trace mode.',
);
assertIncludes(
  navigate,
  "topStatusOverlaysVisible && navigationOverlayMode !== 'preview' && !idleDestinationSearchVisible",
  'Route/Preview top-left artifact should stay suppressed during Road Preview.',
);

console.log('Route builder UX polish checks passed.');

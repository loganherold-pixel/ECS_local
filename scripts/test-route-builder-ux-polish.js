const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigate = fs
  .readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(fragment, message) {
  assert.ok(navigate.includes(fragment), message);
}

function assertNotIncludes(fragment, message) {
  assert.ok(!navigate.includes(fragment), message);
}

assertIncludes(
  'const routeBuilderControlBottomOffset =\n    routeSurfaceBottomOffset + (routePreviewVisualMode ? routeSurfaceHeight + OVERLAY_GAP : 0);',
  'Build Route controls should use the same bottom/app-safe clearance as Road Preview and rise above preview when needed.',
);
assertIncludes(
  'bottom: routeBuilderControlBottomOffset,\n                left: OVERLAY_EDGE,',
  'Build Route control strip should anchor bottom-left instead of top-right.',
);
assertNotIncludes(
  'top: MAP_TOP_CONTROL_ROW,\n                right: OVERLAY_EDGE,\n                maxWidth: Math.min(322, adaptive.windowWidth - OVERLAY_EDGE * 2),',
  'Build Route control strip should not use the old top-right placement.',
);
assertIncludes(
  'const campsiteDrawControlsVisible =\n    !routeBuilderActive &&',
  'Campsite polygon draw controls should be hidden while Build Route is active.',
);
assertNotIncludes(
  'accessibilityLabel="Save campsite drawing"',
  'Finished campsite polygon controls should not expose the obsolete Save action.',
);
const routeBuilderOpenClearStart = navigate.indexOf(
  'if (nextRouteBuilderActive && !campsiteDrawingClosed) {',
);
assert.ok(
  routeBuilderOpenClearStart >= 0,
  'Entering Build Route should detect unfinished campsite polygon drawing state.',
);
const routeBuilderOpenClearEnd = navigate.indexOf(
  '} else if (!campsiteDrawingClosed)',
  routeBuilderOpenClearStart,
);
const routeBuilderOpenClearBlock = navigate.slice(
  routeBuilderOpenClearStart,
  routeBuilderOpenClearEnd,
);
assert.ok(
  routeBuilderOpenClearBlock.includes('setCampsiteDrawingClosed(false);') &&
    routeBuilderOpenClearBlock.includes('setCampsiteDrawingPoints([]);'),
  'Entering Build Route should clear unfinished campsite polygon drawing state.',
);
assertIncludes(
  "setRouteBuilderActive(false);\n    setRouteBuilderDrawing(false);\n    setRouteBuilderSnapSource(null);\n    setRouteBuilderSegments([]);",
  'Entering Draw Camp Search should disable and clear route drawing mode.',
);
assertIncludes(
  "{routeBuilderDrawing ? 'DRAWING ROUTE' : 'DRAW ROUTE'}",
  'Build Route control strip should clearly identify route-line drawing mode.',
);
assertIncludes(
  'accessibilityLabel="Undo last Build Route segment"',
  'Undo action should have an accessible label.',
);
assertIncludes(
  'accessibilityLabel="Clear all Build Route segments"',
  'Clear All action should have an accessible label.',
);
assertIncludes(
  'accessibilityLabel="Cancel Build Route"',
  'Cancel action should have an accessible label.',
);
assertIncludes(
  'accessibilityLabel="Save and preview Build Route"',
  'Preview/save action should have an accessible label.',
);
assertIncludes(
  '<Text style={styles.routeBuilderStatusActionText}>CLEAR ALL</Text>',
  'Build Route control strip should label full draft deletion as Clear All.',
);
assertIncludes(
  'PREVIEW',
  'Build Route control strip should expose a Preview action for saved route handoff.',
);
assertIncludes(
  "routeBuilderSnapSource === 'snapping'",
  'Build Route control strip should show snap progress/status.',
);
assertIncludes(
  "const routeIndicatorVisible = topStatusOverlaysVisible && navigationOverlayMode !== 'preview';",
  'Route/Preview top-left artifact should stay suppressed during Road Preview.',
);

console.log('Route builder UX polish checks passed.');

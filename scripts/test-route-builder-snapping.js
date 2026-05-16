const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mapRenderer = fs
  .readFileSync(path.join(root, 'components', 'navigate', 'MapRenderer.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');
const navigate = fs
  .readFileSync(path.join(root, 'app', '(tabs)', 'navigate.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function assertIncludes(source, fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(source, fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

assertIncludes(
  mapRenderer,
  'function isRouteBuilderRouteableFeature(feature)',
  'Build Route snapping should filter rendered map features through an explicit routeable-feature check.',
);
assertIncludes(
  mapRenderer,
  "allTokens.indexOf('building') >= 0",
  'Build Route snapping should reject irrelevant non-navigation features like buildings.',
);
assertIncludes(
  mapRenderer,
  'routeableClasses[className] || routeableClasses[subclass]',
  'Build Route snapping should prefer known routeable road/trail/path classes.',
);
assertIncludes(
  mapRenderer,
  "sourceLabel: 'free'",
  'Build Route tracing should fall back to free geometry when no routeable snap candidate is available.',
);
assertIncludes(
  mapRenderer,
  'function routeBuilderRawCoordinateFromPoint(point)',
  'Build Route tracing should convert the pointer to a raw map coordinate for fallback drawing.',
);
assertIncludes(
  mapRenderer,
  'function pickRouteBuilderTracePoint(point)',
  'Build Route tracing should centralize snapped vs free point selection.',
);
assertIncludes(
  mapRenderer,
  'function findNearestRouteableSegment(point, context)',
  'Build Route snapping should use a dedicated nearest-routeable segment abstraction.',
);
assertIncludes(
  mapRenderer,
  'function snapTracePoint(point, context)',
  'Build Route tracing should route raw pointer input through a snapped trace-point helper.',
);
assertIncludes(
  mapRenderer,
  'function classifyRouteBuilderSnapSource(feature)',
  'Build Route snapping should classify rendered road/trail/path features for trace feedback.',
);
assertIncludes(
  mapRenderer,
  "return 'trail';",
  'Build Route snapping should allow routeable trail/path/track features to continue a road trace.',
);
assertIncludes(
  mapRenderer,
  "return 'road';",
  'Build Route snapping should identify road/street features separately from generic routeable geometry.',
);
assertIncludes(
  mapRenderer,
  'function routeBuilderSnapContinuityPenalty(candidate, rawPoint)',
  'Build Route snapping should score candidates with direction continuity to reduce jumpy snaps.',
);
assertIncludes(
  mapRenderer,
  'var ROUTE_BUILDER_SNAP_FEATURE_SWITCH_PENALTY = 18;',
  'Build Route snapping should make feature switching conservative but still possible at road/trail transitions.',
);
assertIncludes(
  mapRenderer,
  'var ROUTE_BUILDER_FINAL_SNAP_PX = 64;',
  'Build Route finalization should use a bounded pointer-up snap tolerance.',
);
assertIncludes(
  mapRenderer,
  'var routeBuilderRawTraceSegments = [];',
  'Build Route should keep raw drag points separate from displayed snapped route geometry.',
);
assertIncludes(
  mapRenderer,
  'function appendRawTracePoint(rawCoordinate)',
  'Build Route should preserve raw trace points as the user drags.',
);
assertIncludes(
  mapRenderer,
  'function finalizeRouteBuilderSegmentSnap(segmentId, rawSegmentId)',
  'Build Route should finalize each pointer-up stroke through a segment snap/match pass.',
);
assertIncludes(
  mapRenderer,
  'segment.rawSegment = rawCoordinates.slice();',
  'Build Route finalized segments should preserve the raw drawn geometry.',
);
assertIncludes(
  mapRenderer,
  'segment.snappedSegment = highLine.slice();',
  'Build Route finalized segments should preserve the snapped geometry when confidence is high.',
);
assertIncludes(
  mapRenderer,
  "segment.snapConfidence = 'high';",
  'Build Route should mark high-confidence final snaps.',
);
assertIncludes(
  mapRenderer,
  "segment.snapConfidence = 'medium';",
  'Build Route should mark medium-confidence final snaps.',
);
assertIncludes(
  mapRenderer,
  "segment.snapStatus = ambiguous ? 'ambiguous' : 'raw_smoothed';",
  'Build Route should keep smoothed raw geometry instead of wild snapping when confidence is low or ambiguous.',
);
assertIncludes(
  mapRenderer,
  "allTokens.indexOf('private') >= 0",
  'Build Route snapping should exclude routeable features marked private when the map data exposes that signal.',
);
assertIncludes(
  mapRenderer,
  "allTokens.indexOf('closed') >= 0",
  'Build Route snapping should exclude routeable features marked closed when the map data exposes that signal.',
);
assertIncludes(
  mapRenderer,
  'var ROUTE_BUILDER_APPEND_MIN_PX = 4;',
  'Build Route tracing should append points densely enough for visible live feedback.',
);
assertNotIncludes(
  mapRenderer,
  'ROUTE_BUILDER_CONTINUE_PX',
  'Build Route must not merge nearby finger-down/up strokes into the previous segment.',
);
assertIncludes(
  mapRenderer,
  'function getLastBuilderPointInfo()',
  'Build Route should expose the current draft endpoint for undo/retrace anchoring.',
);
assertIncludes(
  mapRenderer,
  'function syncRouteBuilderTraceAnchorFromDraft()',
  'Build Route should restore the last-good trace anchor from React state after undo/clear sync.',
);
assertIncludes(
  mapRenderer,
  'var previousEndpoint = getLastBuilderPoint();\n        var segmentStart = previousEndpoint || startCoordinate;',
  'Each new Build Route stroke should become a distinct segment anchored from the previous endpoint.',
);
assertIncludes(
  mapRenderer,
  "id: 'draft-' + Date.now() + '-' + routeBuilderDraftSegments.length,\n          coordinates: [segmentStart]",
  'Build Route should create a new draft segment for each stroke instead of reusing the prior segment.',
);
assertIncludes(
  mapRenderer,
  'if (!appendBuilderCoordinate(tracePoint.coordinate)) {\n          updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor);\n        }',
  'Build Route should render the active endpoint immediately even before the first moved point is appended.',
);
assertIncludes(
  mapRenderer,
  'var ROUTE_BUILDER_SEND_INTERVAL_MS = 64;',
  'Build Route updates should be responsive while still throttling bridge traffic.',
);
assertNotIncludes(
  mapRenderer,
  "{ label: 'draft', segments: routeBuilderDraftSegments }",
  'Build Route snapping should not snap new points to the previous freehand draft line.',
);
assertNotIncludes(
  mapRenderer,
  "{ label: 'speed', segments: pendingPayload ? (pendingPayload.speedSegments || []) : [] }",
  'Build Route snapping should not use speed/breadcrumb overlays as routeable network geometry.',
);
assertIncludes(
  navigate,
  "routeBuilderSnapSource && routeBuilderSnapSource !== 'free'",
  'Navigate status should distinguish snapped route geometry from free visible geometry.',
);
assertIncludes(
  navigate,
  "`${routeBuilderSavableSegments.length} seg${routeBuilderSavableSegments.length === 1 ? '' : 's'} - ${",
  'Navigate status should count saved Build Route strokes as segments, not one merged drawing.',
);
assertIncludes(
  navigate,
  "routeBuilderSnapSource === 'snapping'",
  'Navigate should show a compact snapping/progress state while pointer-up segment matching runs.',
);
assertIncludes(
  navigate,
  "routeBuilderSnapStatus === 'raw_smoothed' || routeBuilderSnapStatus === 'ambiguous'",
  'Navigate should show a clear retry/undo hint when final segment snapping keeps raw geometry.',
);

console.log('Route builder snapping regression checks passed.');

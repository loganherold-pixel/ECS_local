const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const navigateTab = fs
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
  navigateTab,
  'const sameCoordinateList = (leftInput: any, rightInput: any) => {',
  'Build Route segment equality should compare full geometry lists, not only segment endpoints.',
);
assertIncludes(
  navigateTab,
  '!sameCoordinateList(left.rawSegment, right.rawSegment)',
  'Build Route segment equality should include raw stroke geometry so raw fallback state stays consistent.',
);
assertIncludes(
  navigateTab,
  '!sameCoordinateList(left.snappedSegment, right.snappedSegment)',
  'Build Route segment equality should include snapped geometry so pointer-up corrections are retained.',
);
assertNotIncludes(
  navigateTab,
  'const leftLast = leftCoords[leftCoords.length - 1]',
  'Build Route segment equality should no longer rely on the last point only.',
);
assertIncludes(
  navigateTab,
  'const nextSegments = routeBuilderSegments.filter((_, index) => index !== removeIndex);',
  'Undo should remove exactly one latest drawable Build Route segment.',
);
assertIncludes(
  navigateTab,
  'const previousEndpointSegment = [...nextSegments]',
  'Undo should find the previous remaining segment for retrace/status restoration.',
);
assertIncludes(
  navigateTab,
  'setRouteBuilderSnapSource(previousEndpointSegment?.snapSource ?? null);',
  'Undo should restore snap source from the previous segment instead of clearing all route context.',
);
assertIncludes(
  navigateTab,
  'setRouteBuilderSnapStatus(previousEndpointSegment?.snapStatus ?? null);',
  'Undo should restore snapped/raw status from the previous segment.',
);
assertIncludes(
  navigateTab,
  'setRouteBuilderSnapMessage(previousEndpointSegment?.snapMessage ?? null);',
  'Undo should restore any low-confidence/raw fallback hint from the previous segment.',
);
assertIncludes(
  mapRenderer,
  'routeBuilderRawTraceSegments = [];\n          routeBuilderActiveRawSegmentId = null;\n          routeBuilderTraceSessionId = null;\n          routeBuilderDraftSegments = cloneBuilderSegments(payload.routeBuilderSegments || []);',
  'MapRenderer should drop stale raw trace sessions when React syncs an undo/clear result.',
);
assertIncludes(
  mapRenderer,
  'syncRouteBuilderTraceAnchorFromDraft();',
  'MapRenderer should rebuild the drawing anchor from the previous segment endpoint after undo.',
);
assertIncludes(
  mapRenderer,
  'segment.rawSegment = rawCoordinates.slice();',
  'Undo must work with raw fallback segments because raw geometry is retained on the segment.',
);
assertIncludes(
  mapRenderer,
  'segment.snappedSegment = highLine.slice();',
  'Undo must work with snapped segments because snapped geometry is retained on the segment.',
);

console.log('Route builder undo behavior checks passed.');

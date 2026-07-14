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
  'Build Route segment equality should still compare full geometry lists for saved snapped legs.',
);
assertIncludes(
  navigateTab,
  '!sameCoordinateList(left.rawSegment, right.rawSegment)',
  'Build Route segment equality should include raw geometry metadata when present.',
);
assertIncludes(
  navigateTab,
  '!sameCoordinateList(left.snappedSegment, right.snappedSegment)',
  'Build Route segment equality should include snapped geometry.',
);
assertNotIncludes(
  navigateTab,
  'const leftLast = leftCoords[leftCoords.length - 1]',
  'Build Route segment equality should no longer rely on the last point only.',
);

assertIncludes(
  navigateTab,
  'const [routeBuilderDraft, setRouteBuilderDraft] = useState<NavigateRouteDraft>(() => createNavigateRouteDraft());',
  'Navigate should track a first-class anchor/leg route draft.',
);
assertIncludes(
  navigateTab,
  'const nextHistory = undoNavigateRouteDraftHistory(routeBuilderDraftHistoryRef.current);',
  'Undo should move the route draft history back one operator edit.',
);
assertIncludes(
  navigateTab,
  'applyRouteBuilderDraft(nextHistory.present, { recordHistory: false });',
  'Undo should rebuild saved route-builder segments from the anchor draft.',
);
assertIncludes(
  navigateTab,
  'const nextHistory = redoNavigateRouteDraftHistory(routeBuilderDraftHistoryRef.current);',
  'Redo should restore the latest undone route draft.',
);
assertIncludes(
  navigateTab,
  'routeBuilderDraftHistoryRef.current = createNavigateRouteDraftHistory(emptyDraft);',
  'Cancel and reset should clear route builder undo and redo history.',
);
assertIncludes(
  navigateTab,
  'const nextDraft = clearNavigateRouteDraft(routeBuilderDraft);',
  'Clear should remove every dropped anchor and traced leg.',
);
assertIncludes(
  navigateTab,
  'buildRouteBuilderSegmentsFromDraft(nextDraft)',
  'Navigate should derive saveable route segments from the anchor draft.',
);
assertIncludes(
  navigateTab,
  "showToast('LAST ROUTE POINT UNDONE')",
  'Undo feedback should describe points rather than freehand segments.',
);
assertNotIncludes(
  navigateTab,
  'const nextSegments = routeBuilderSegments.filter((_, index) => index !== removeIndex);',
  'Undo should no longer mutate freehand segment arrays directly.',
);
assertNotIncludes(
  navigateTab,
  "showToast('LIFT FINGER TO UNDO')",
  'Undo should not reference the removed freehand gesture mode.',
);

assertIncludes(
  mapRenderer,
  'routeBuilderAnchors = payload.routeBuilderAnchors || [];',
  'MapRenderer should sync route-builder anchors from React.',
);
assertIncludes(
  mapRenderer,
  'updateRouteBuilder(routeBuilderDraftSegments, routeBuilderColor, routeBuilderAnchors);',
  'MapRenderer should render anchors alongside traced legs.',
);
assertIncludes(
  mapRenderer,
  "if (routeBuilderMode === 'anchor_trace') return false;",
  'Anchor route builder should disable the old pointer-drag freehand path.',
);
assertIncludes(
  mapRenderer,
  'route-profile-focus-source',
  'MapRenderer should preserve profile-focus rendering for the route profile scrubber.',
);

console.log('Route builder undo behavior checks passed.');

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

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notStrictEqual(start, -1, `Expected source to include ${startFragment}`);
  const end = source.indexOf(endFragment, start);
  assert.notStrictEqual(end, -1, `Expected source to include ${endFragment}`);
  return source.slice(start, end);
}

assertIncludes(
  navigateTab,
  'const routeBuilderStagedRunIdRef = useRef<string | null>(null);',
  'Navigate should track the run created by the current Build Route staging flow.',
);
assertIncludes(
  navigateTab,
  'const routeBuilderStagedRouteIdRef = useRef<string | null>(null);',
  'Navigate should track the route created by the current Build Route staging flow.',
);
assertIncludes(
  navigateTab,
  'const resetBuildRouteDraft = useCallback',
  'Build Route draft cleanup should be centralized through a shared reset helper.',
);
assertIncludes(
  navigateTab,
  'setRouteBuilderSnapSource(null);\n  setRouteBuilderSegments([]);',
  'Build Route reset should clear snap source plus raw/snapped staged segments.',
);
assertIncludes(
  navigateTab,
  'const clearStagedBuildRoutePreview = useCallback',
  'Build Route cancellation should have a focused preview cleanup helper.',
);
assertIncludes(
  navigateTab,
  "currentRouteSnapshot.lifecycle === 'active'",
  'Build Route preview cleanup should guard active navigation before clearing staged runs.',
);
assertIncludes(
  navigateTab,
  'if (stagedRunId && runStore.getActive()?.id === stagedRunId)',
  'Build Route cancellation should only deactivate the specific staged Build Route run.',
);
assertIncludes(
  navigateTab,
  'if (stagedRouteId && routeStore.getActive()?.id === stagedRouteId)',
  'Build Route cancellation should only deactivate the specific staged Build Route route.',
);
assertIncludes(
  navigateTab,
  'void clearExploreNavigationPayload();',
  'Build Route cancellation should remove the staged route preview payload when it owns it.',
);
assertIncludes(
  navigateTab,
  'clearStagedBuildRoutePreview();\n  showToast(\'BUILD ROUTE CANCELLED\');',
  'Cancel should clear the Build Route-owned staged preview before reporting cancellation.',
);
const mapRouteIndicatorBlock = blockBetween(
  navigateTab,
  'const mapRouteIndicator = useMemo(() => {',
  'const primaryCampSuggestion = campIntelSites[0] ?? null;',
);
assertIncludes(
  mapRouteIndicatorBlock,
  'if (isCustomRun && !activeRunIsNavigating) {\n      return null;\n    }',
  'Build Route custom staged runs should not render the top-left Custom/Staged map badge.',
);
assertNotIncludes(
  mapRouteIndicatorBlock,
  "title: 'CUSTOM',\n      state: 'STAGED'",
  'Navigate should not have a direct Custom Staged route badge render path.',
);
assertIncludes(
  navigateTab,
  'resetBuildRouteDraft({ keepActive: true });',
  'The draft CLEAR action should remove drawn points without leaving Build Route mode.',
);
assertIncludes(
  navigateTab,
  'setRouteBuilderActive(false);\n    setRouteBuilderDrawing(false);\n    setRouteBuilderSnapSource(null);\n    setRouteBuilderSegments([]);',
  'Starting Draw Camp Search should fully disconnect the Build Route draft so the two draw modes do not conflict.',
);
assertIncludes(
  mapRenderer,
  'function clearRouteBuilderDraftRuntime()',
  'MapRenderer should fully clear WebView-local route builder draft state on cancellation.',
);
assertIncludes(
  mapRenderer,
  'routeBuilderDraftSegments = [];\n        routeBuilderPointerId = null;',
  'MapRenderer cancellation should drop cached draft geometry and active pointer state.',
);
assertIncludes(
  mapRenderer,
  'routeBuilderLastSnapSource = null;',
  'MapRenderer cancellation should clear the visible snap/free-mode status.',
);
assertIncludes(
  mapRenderer,
  'resetRouteBuilderTraceRecovery();',
  'MapRenderer cancellation should clear last-good/free-mode recovery state.',
);
assertIncludes(
  mapRenderer,
  'clearRouteBuilderDraftRuntime();',
  'Deactivating Build Route should use the full draft cleanup path.',
);

console.log('Route builder cancellation cleanup checks passed.');

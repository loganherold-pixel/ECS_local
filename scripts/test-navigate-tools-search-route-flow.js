const fs = require('fs');
const path = require('path');

const root = process.cwd();
const navigatePath = path.join(root, 'app/(tabs)/navigate.tsx');
const roadNavigationPath = path.join(root, 'lib/useRoadNavigation.ts');
const roadOverlayPath = path.join(root, 'components/navigate/RoadNavigationOverlay.tsx');

const normalize = (value) => value.replace(/\r\n/g, '\n');
const navigateSource = normalize(fs.readFileSync(navigatePath, 'utf8'));
const roadNavigationSource = normalize(fs.readFileSync(roadNavigationPath, 'utf8'));
const roadOverlaySource = normalize(fs.readFileSync(roadOverlayPath, 'utf8'));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, tokens, message) {
  const missing = tokens.filter((token) => !source.includes(token));
  assert(missing.length === 0, `${message} Missing: ${missing.join(', ')}`);
}

assertIncludes(
  navigateSource,
  [
    'value={idleDestinationSearchDraftQuery}',
    'onChangeText={handleIdleDestinationSearchChangeText}',
    'loading={idleDestinationSearchLoadingVisible}',
    'disabled={searchOperationalState.disabled}',
    'onClear={',
    "returnKeyType: 'search'",
    "accessibilityLabel: 'Search address or place'",
    "accessibilityHint: 'Search for a destination to build a road navigation route.'",
  ],
  'Map-level destination search should remain wired to road navigation and mobile keyboard behavior.',
);

assertIncludes(
  navigateSource,
  [
    'visibleIdleDestinationSearchSuggestions.map((suggestion) =>',
    'onPress={() => handleRoadOverlaySelectSuggestion(suggestion)}',
    'handleRecentSearchSelection(suggestion)',
  ],
  'Map-level search and recent result rows should still select road navigation suggestions.',
);

assertIncludes(
  navigateSource,
  [
    'const handleRoadOverlaySelectSuggestion = useCallback((suggestion: RoadNavSearchSuggestion) => {',
    'setRecentSearchesVisible(false);',
    'rememberRecentRoadSearch(suggestion)',
    'clearActiveRunSelection();',
    'clearExploreNavigationPayload();',
    'endTrailNavigation();',
    'selectRoadSuggestion(suggestion);',
    'closeToolsPopup();',
  ],
  'Selecting a map-level search result should preserve the same route-building handoff.',
);

assertIncludes(
  roadNavigationSource,
  [
    'searchRoadDestinations({',
    'setSuggestions(results)',
    'const selectSuggestion = useCallback(',
    'resolveRoadDestination({',
    "requestRouteForDestination(\n          destination,\n          'route_preview',",
    'fetchRoadRouteAlternatives({',
    'applyRoute(',
    'validRoute,',
    'requestedStatus,',
    'destination,',
    'createdFrom,',
    'validRoutes,',
  ],
  'Road navigation hook should still geocode, resolve, route, and enter route preview.',
);

assertIncludes(
  navigateSource,
  [
    '<RoadNavigationOverlay',
    'query={HIDDEN_ROAD_NAVIGATION_SEARCH_QUERY}',
    'onChangeQuery={noopHiddenRoadNavigationSearchQuery}',
    'suggestions={EMPTY_ROAD_NAVIGATION_SEARCH_SUGGESTIONS}',
    'onSelectSuggestion={noopHiddenRoadNavigationSearchSuggestion}',
    'showSearchSurface={false}',
    'onStartNavigation={handleRoadOverlayStartNavigation}',
    'onPrimaryPreviewAction={handleRoadOverlayStartNavigation}',
    'onRouteOverview={handleRouteOverview}',
    'onPrepareOffline={handlePrepareOfflineFromRoadPreview}',
    'buildRouteGuidanceReadinessViewModel({',
    'deriveOfflineReadiness({',
  ],
  'Road preview should keep route actions and readiness/offline context while search remains map-owned.',
);

assertIncludes(
  roadOverlaySource,
  [
    'onPrimaryPreviewAction ?? onStartNavigation',
    "action.id === 'prepare_offline'",
    '? onPrepareOffline',
    'readinessStack.rows.map((row)',
  ],
  'Road navigation overlay should still expose Start, Prepare Offline, and readiness actions.',
);

assert(
  !roadOverlaySource.includes("action.id === 'review_route'"),
  'Road navigation overlay should not render the redundant Review Route readiness action.',
);

console.log('navigate tools search route-flow regression passed');

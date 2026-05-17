const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const overlayPath = path.join(root, 'components', 'navigate', 'RoadNavigationOverlay.tsx');
const source = fs.readFileSync(overlayPath, 'utf8').replace(/\r\n/g, '\n');
const navigatePath = path.join(root, 'app', '(tabs)', 'navigate.tsx');
const navigateSource = fs.readFileSync(navigatePath, 'utf8').replace(/\r\n/g, '\n');
const routePreviewModalSource = fs.readFileSync(
  path.join(root, 'components', 'discover', 'ExploreRoutePreviewModal.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const dispersedSummarySource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'DispersedCampingRouteSummary.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const establishedSummarySource = fs.readFileSync(
  path.join(root, 'components', 'navigate', 'EstablishedCampsitesRouteSummary.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

function assertIncludes(fragment, message) {
  assert.ok(source.includes(fragment), message);
}

function assertNotIncludes(fragment, message) {
  assert.ok(!source.includes(fragment), message);
}

function assertNavigateIncludes(fragment, message) {
  assert.ok(navigateSource.includes(fragment), message);
}

function assertNavigateNotIncludes(fragment, message) {
  assert.ok(!navigateSource.includes(fragment), message);
}

function extractStyleBlock(styleName) {
  const marker = `${styleName}: {`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${styleName} style should exist.`);
  const bodyStart = start + marker.length;
  const end = source.indexOf('\n  },', bodyStart);
  assert.ok(end >= 0, `${styleName} style should be a simple StyleSheet block.`);
  return source.slice(bodyStart, end);
}

assertIncludes(
  'styles.previewBottomWrap',
  'Road Preview should use a preview-specific wrapper style.',
);
assertIncludes(
  'style={[StyleSheet.absoluteFill, styles.overlayRoot]}',
  'Road Preview overlay should have a high-priority root stacking context.',
);
assertIncludes(
  'styles.activeGuidanceWrap',
  'Active Guidance should keep its own wrapper style separate from Road Preview.',
);
assertIncludes(
  'const showSteps = false;',
  'Road Preview should hide the broken route-step action until it can open in a proper ECS sheet.',
);
assertIncludes(
  'const routeStepOverlayEnabled = false;',
  'Road Preview should disconnect the hidden route-step overlay container.',
);
assertIncludes(
  'routeStepOverlayEnabled && props.stepListExpanded && hasSteps',
  'Route-step overlay mounting should be guarded by the explicit disabled flag.',
);
assertNotIncludes(
  'false && props.stepListExpanded && hasSteps',
  'Route-step overlay disabling should be explicit rather than an opaque JSX false guard.',
);

const previewBottomWrap = extractStyleBlock('previewBottomWrap');
assert.ok(
  /alignItems:\s*'flex-start'/.test(previewBottomWrap),
  'Road Preview should anchor to the bottom-left instead of centering on wide layouts.',
);
assert.ok(
  /zIndex:\s*92/.test(previewBottomWrap) && /elevation:\s*92/.test(previewBottomWrap),
  'Road Preview wrapper should stack above camping route summary overlays on iOS/web and Android.',
);
assert.ok(
  !/alignItems:\s*'center'/.test(previewBottomWrap),
  'Road Preview must not use centered tablet/wide alignment.',
);

const overlayRoot = extractStyleBlock('overlayRoot');
assert.ok(
  /zIndex:\s*90/.test(overlayRoot) && /elevation:\s*90/.test(overlayRoot),
  'Road Navigation overlay root should remain above lower-priority map overlays rendered later.',
);

const previewBottomCard = extractStyleBlock('previewBottomCard');
assert.ok(
  /zIndex:\s*93/.test(previewBottomCard) && /elevation:\s*93/.test(previewBottomCard),
  'Road Preview card should keep controls above camping overlays and clickable.',
);

const activeGuidanceWrap = extractStyleBlock('activeGuidanceWrap');
assert.ok(
  /alignItems:\s*'center'/.test(activeGuidanceWrap),
  'Active Guidance alignment should be unchanged by the Road Preview fix.',
);

assert.ok(
  dispersedSummarySource.includes('zIndex: 24') && dispersedSummarySource.includes('elevation: 24'),
  'Dispersed Camping Near Route summary should stay below the Road Preview panel.',
);
assert.ok(
  establishedSummarySource.includes('zIndex: 25') && establishedSummarySource.includes('elevation: 25'),
  'Established Campsites route summary should stay below the Road Preview panel.',
);
assertNavigateIncludes(
  'zIndex: 23,\n  elevation: 23,',
  'Dispersed Camping Eligibility legend should stay below the Road Preview panel.',
);

assertNavigateIncludes(
  "accessibilityLabel=\"Draw area to search for campsites\"",
  'Draw area control should have a clear campsite-search accessibility label.',
);
assertNavigateIncludes(
  'DRAW AREA',
  'Draw area control should use a clear visible label.',
);
assertNavigateIncludes(
  "accessibilityLabel={routeBuilderActive ? 'Exit Build Route mode' : 'Build a route'}",
  'Build Route control should have a clear accessibility label.',
);
assertNavigateIncludes(
  "{routeBuilderActive ? 'EXIT BUILD' : 'BUILD ROUTE'}",
  'Build Route control should use a clear visible text label.',
);
assertNavigateIncludes(
  "quickActionButton: {\n  width: '48%',",
  'Draw and Build Route controls should use stable half-width text cards on phone and tablet.',
);
assertNavigateIncludes(
  'minHeight: 54',
  'Draw and Build Route controls should keep a usable touch target height.',
);
assertNavigateNotIncludes(
  "name={routeBuilderActive ? 'close' : 'git-branch-outline'}",
  'Build Route quick action should not use the unclear git-branch icon.',
);
assertNavigateIncludes(
  "const routeIndicatorVisible = topStatusOverlaysVisible && navigationOverlayMode !== 'preview';",
  'Road Preview should suppress the top-left Route/Preview indicator artifact.',
);
assertNavigateIncludes(
  'if (!roadStepListExpanded || navigationOverlayMode !== \'preview\') return;',
  'Road Preview should close any stale route-step expanded state.',
);
assertNavigateIncludes(
  'showSteps: false,',
  'Road Preview contexts should keep route steps hidden for this bug pass.',
);
assertNavigateNotIncludes(
  "import ExploreRoutePreviewModal from '../../components/discover/ExploreRoutePreviewModal';",
  'Navigate Route Preview should no longer open the shared preview modal from the map controls.',
);
assertNavigateNotIncludes(
  'routePreviewModalVisible',
  'Navigate Route Preview should not keep modal visibility state.',
);
assertNavigateNotIncludes(
  'setRoutePreviewModalVisible',
  'Navigate Route Preview should not open or close a popup/modal.',
);
assertNavigateIncludes(
  'buildNavigationPayloadFromRoadRoute(roadNavigation.session.route)',
  'Navigate generated road routes should normalize into the shared route-preview payload contract.',
);
assertNavigateIncludes(
  "import {\n  buildExploreRoutePreviewCameraCommand,\n  getExploreRoutePreviewRoutePoints,\n} from '../../lib/exploreRoutePreview';",
  'Navigate should use shared route-preview helpers to calculate a full-route camera command.',
);
assertNavigateIncludes(
  'const fitMapToNavigateRoutePreview = useCallback((',
  'Navigate should centralize the Route Preview camera fit behavior.',
);
assertNavigateIncludes(
  'const routePoints = getExploreRoutePreviewRoutePoints(payload);',
  'Route Preview should fit the actual route geometry and endpoints, not a popup.',
);
assertNavigateIncludes(
  'const { command } = buildExploreRoutePreviewCameraCommand(routePoints, 84);',
  'Route Preview should build a padded map camera command for the full route.',
);
assertNavigateIncludes(
  "reason: 'navigate_route_preview_overview'",
  'Route Preview should queue a map camera command with a clear reason.',
);
assertNavigateIncludes(
  "if (navigationOverlayMode === 'preview')",
  'The Road Preview overview action should use the camera behavior while a route is staged for preview.',
);
assertNavigateNotIncludes(
  '<ExploreRoutePreviewModal',
  'Navigate should not render a Route Preview popup/modal.',
);
assertNavigateNotIncludes(
  "stepListLabel: 'View route steps'",
  'Road Preview should not provide the broken View Route Steps action label.',
);
assertNavigateNotIncludes(
  "stepListLabel: 'View road steps'",
  'Road Preview should not provide the broken View Road Steps action label.',
);
assert.ok(
  !routePreviewModalSource.includes("{' '}"),
  'Route Preview modal actions must not render raw whitespace text nodes inside TouchableOpacity.',
);

console.log('Navigate Road Preview layout checks passed.');
